import { db } from '../src/services/db';
import { Project, Milestone } from '../src/types';

describe('Ledger & Invariant Integrity Tests', () => {
  beforeEach(() => {
    db.clearAll();
  });

  test('enforces milestone sum invariant matching project total', async () => {
    const project: Project = {
      id: 'proj-inv-01',
      client_id: '11111111-1111-1111-1111-111111111111',
      raw_prompt: 'Test project',
      total_amount: 200,
      currency: 'USD',
      captured_total: 0,
      status: 'DRAFT',
    };
    await db.createProject(project);

    // Milestones sum to only $150 (violates $200 total)
    const m1: Milestone = {
      id: 'm1',
      project_id: 'proj-inv-01',
      seq: 1,
      title: 'M1',
      amount: 100,
      deliverables: ['D1'],
      status: 'PENDING',
    };
    const m2: Milestone = {
      id: 'm2',
      project_id: 'proj-inv-01',
      seq: 2,
      title: 'M2',
      amount: 50,
      deliverables: ['D2'],
      status: 'PENDING',
    };
    await db.createMilestone(m1);
    await db.createMilestone(m2);

    // Updating status to AWAITING_APPROVAL should fail with CONTRACT_SUM_MISMATCH
    await expect(
      db.updateProject('proj-inv-01', { status: 'AWAITING_APPROVAL' })
    ).rejects.toThrow('CONTRACT_SUM_MISMATCH');
  });

  test('appends entries to money_ledger and preserves audit history', async () => {
    const projId = 'proj-ledger-01';
    await db.createProject({
      id: projId,
      client_id: '11111111-1111-1111-1111-111111111111',
      raw_prompt: 'Ledger test',
      total_amount: 200,
      currency: 'USD',
      captured_total: 0,
      status: 'AUTHORIZED',
    });

    // Record AUTHORIZE
    await db.recordLedger('AUTHORIZE', projId, undefined, 200, 'AUTH-001');

    // Record Partial CAPTURE and PAYOUT
    await db.recordLedger('CAPTURE', projId, 'm1', 50, 'CAP-001', 0);
    await db.recordLedger('PAYOUT', projId, 'm1', 50, 'BATCH-001');

    const history = await db.getLedgerByProjectId(projId);
    expect(history).toHaveLength(3);
    expect(history[0].kind).toBe('AUTHORIZE');
    expect(history[1].kind).toBe('CAPTURE');
    expect(history[2].kind).toBe('PAYOUT');
  });

  test('deduplicates PayPal webhook events by event_id', async () => {
    const eventId = 'WH-EVENT-999';

    const firstAttempt = await db.insertEventIfNew(eventId);
    expect(firstAttempt).toBe(true);

    const secondAttempt = await db.insertEventIfNew(eventId);
    expect(secondAttempt).toBe(false); // Duplicate rejected
  });
});
