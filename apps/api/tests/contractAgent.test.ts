import {
  parseContractPrompt,
  heuristicContractParser,
  validateAndBalanceContract,
} from '../src/services/contractAgent';

describe('Contract Agent Unit Tests', () => {
  test('parses natural language prompt and extracts $200 budget and 3-day deadline', async () => {
    const prompt = 'Need a modern SaaS logo, brand guide and social banners in 3 days for $200';
    const contract = await parseContractPrompt(prompt);

    expect(contract.total_amount).toBe(200);
    expect(contract.currency).toBe('USD');
    expect(contract.deadline_days).toBe(3);
    expect(contract.milestones.length).toBeGreaterThanOrEqual(2);
    expect(contract.milestones.length).toBeLessThanOrEqual(5);

    // Validate sum invariant
    const sum = contract.milestones.reduce((acc, m) => acc + m.amount, 0);
    expect(Math.abs(sum - contract.total_amount)).toBeLessThan(0.01);
  });

  test('enforces Milestone 1 cannot exceed 50% of the total budget', () => {
    const rawContract = {
      total_amount: 100,
      currency: 'USD',
      deadline_days: 5,
      deliverable_type: 'logo_design',
      milestones: [
        {
          seq: 1,
          title: 'Deposit Draft',
          description: 'Initial draft',
          amount: 60, // Exceeds 50%
          deadline_days: 1,
          deliverables: ['1x PNG'],
        },
        {
          seq: 2,
          title: 'Final Delivery',
          description: 'Vector SVG',
          amount: 40,
          deadline_days: 4,
          deliverables: ['1x SVG'],
        },
      ],
    };

    const balanced = validateAndBalanceContract(rawContract);
    expect(balanced.milestones[0].amount).toBeLessThanOrEqual(50);
    const sum = balanced.milestones.reduce((acc, m) => acc + m.amount, 0);
    expect(Math.abs(sum - 100)).toBeLessThan(0.01);
  });

  test('automatically self-corrects rounding delta onto the final milestone', () => {
    const rawWithCentDelta = {
      total_amount: 100,
      currency: 'USD',
      deadline_days: 5,
      deliverable_type: 'graphic_design',
      milestones: [
        {
          seq: 1,
          title: 'M1',
          description: 'Concepts',
          amount: 33.33,
          deadline_days: 1,
          deliverables: ['Draft'],
        },
        {
          seq: 2,
          title: 'M2',
          description: 'Revisions',
          amount: 33.33,
          deadline_days: 2,
          deliverables: ['Draft 2'],
        },
        {
          seq: 3,
          title: 'M3',
          description: 'Final',
          amount: 33.33, // Sum is 99.99 (0.01 delta)
          deadline_days: 2,
          deliverables: ['Final assets'],
        },
      ],
    };

    const balanced = validateAndBalanceContract(rawWithCentDelta);
    expect(balanced.milestones[2].amount).toBe(33.34);
    const sum = balanced.milestones.reduce((acc, m) => acc + m.amount, 0);
    expect(sum).toBe(100);
  });

  test('rejects prompts with budget outside allowable $5 to $10,000 range', () => {
    const underBudget = {
      total_amount: 2,
      currency: 'USD',
      deadline_days: 1,
      deliverable_type: 'test',
      milestones: [
        { seq: 1, title: 'M1', amount: 1, deadline_days: 1, deliverables: ['1'] },
        { seq: 2, title: 'M2', amount: 1, deadline_days: 1, deliverables: ['2'] },
      ],
    };
    expect(() => validateAndBalanceContract(underBudget)).toThrow();
  });
});
