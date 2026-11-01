import { z } from 'zod';
import { ParsedContract } from '../types';

export const MilestoneSchema = z.object({
  seq: z.number().int().min(1).max(5),
  title: z.string().min(2),
  description: z.string().default(''),
  amount: z.number().positive(),
  deadline_days: z.number().int().min(1).max(20),
  deliverables: z.array(z.string()).min(1),
});

export const ContractSchema = z.object({
  total_amount: z.number().min(5).max(10000),
  currency: z.literal('USD').default('USD'),
  deadline_days: z.number().int().min(1).max(20),
  deliverable_type: z.string().default('general_freelance'),
  milestones: z.array(MilestoneSchema).min(2).max(5),
});

export async function parseContractPrompt(prompt: string): Promise<ParsedContract> {
  if (!prompt || prompt.trim().length < 5) {
    throw new Error('VALIDATION_ERROR: Prompt is too short to parse a contract');
  }

  // Check if live OpenAI key exists and MOCK_AI is not forced
  if (process.env.OPENAI_API_KEY && process.env.MOCK_AI !== 'true') {
    try {
      return await callOpenAIContractAgent(prompt);
    } catch (err: any) {
      console.warn('OpenAI Contract Agent failed or rate-limited, falling back to heuristic parser:', err.message);
    }
  }

  // Deterministic Intelligent Fallback Parser (supports English, Hindi, Hinglish)
  return heuristicContractParser(prompt);
}

async function callOpenAIContractAgent(prompt: string): Promise<ParsedContract> {
  const systemPrompt = `You are an expert freelance contract manager. Convert the client's request into a fair milestone-based escrow contract.
Rules:
- Output ONLY valid JSON matching the schema.
- 2 to 5 milestones. Amounts must sum exactly to total_amount.
- Never put more than 50% of the budget in the first milestone.
- Put the largest payment on final delivery of source files.
- Each milestone needs objective, checkable deliverables (file types and counts).
- Input may be in Hindi, Hinglish, or English. Output in English.
- If amount is missing or outside 5-10000 USD, respond with error: "MISSING_OR_INVALID_AMOUNT".
- Deadline must not exceed 20 days.`;

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-4o',
      temperature: 0.2,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: prompt },
      ],
    }),
  });

  if (!res.ok) {
    throw new Error(`OpenAI API error HTTP ${res.status}`);
  }

  const data: any = await res.json();
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error('Empty response from OpenAI');

  const rawJson = JSON.parse(content);
  return validateAndBalanceContract(rawJson);
}

export function heuristicContractParser(prompt: string): ParsedContract {
  // Extract budget: look for "$200" or "200$" or "200 dollars" or "budget 200"
  let amount = 200;
  const budgetMatch = prompt.match(/\$?\s*(\d+(\.\d{1,2})?)\s*(\$|usd|dollars)?/i);
  if (budgetMatch && budgetMatch[1]) {
    const parsed = parseFloat(budgetMatch[1]);
    if (parsed >= 5 && parsed <= 10000) {
      amount = parsed;
    }
  }

  // Extract deadline: look for "3 days", "5 din", "in 3 days"
  let deadlineDays = 3;
  const daysMatch = prompt.match(/(\d+)\s*(days|day|din)/i);
  if (daysMatch && daysMatch[1]) {
    const parsedDays = parseInt(daysMatch[1], 10);
    if (parsedDays >= 1 && parsedDays <= 20) {
      deadlineDays = parsedDays;
    }
  }

  // Derive deliverable type
  let deliverableType = 'general_design';
  if (/logo|brand|graphic|banner|vector|icon/i.test(prompt)) {
    deliverableType = 'logo_design';
  } else if (/web|frontend|backend|api|react|next|code|fullstack/i.test(prompt)) {
    deliverableType = 'software_development';
  } else if (/copy|article|content|blog|write/i.test(prompt)) {
    deliverableType = 'content_writing';
  }

  // Generate 3 balanced milestones: 25%, 35%, 40% (ensures M1 <= 50%, final has largest)
  const m1Amount = Math.round(amount * 0.25 * 100) / 100;
  const m2Amount = Math.round(amount * 0.35 * 100) / 100;
  const m3Amount = Math.round((amount - m1Amount - m2Amount) * 100) / 100;

  const raw = {
    total_amount: amount,
    currency: 'USD',
    deadline_days: deadlineDays,
    deliverable_type: deliverableType,
    milestones: [
      {
        seq: 1,
        title: 'Initial Concepts & Sketches',
        description: 'Initial drafts and conceptual directions for review',
        amount: m1Amount,
        deadline_days: Math.max(1, Math.floor(deadlineDays / 3)),
        deliverables: ['3x Concept PNG previews', 'Design rationale notes'],
      },
      {
        seq: 2,
        title: 'Refinements & Revisions',
        description: 'Iterative refinement based on feedback and color palette alignment',
        amount: m2Amount,
        deadline_days: Math.max(1, Math.floor(deadlineDays / 3)),
        deliverables: ['Revised High-Resolution PNG', 'Style specifications'],
      },
      {
        seq: 3,
        title: 'Final Delivery & Source Assets',
        description: 'Delivery of production-ready vector assets and export files',
        amount: m3Amount,
        deadline_days: Math.max(1, Math.ceil(deadlineDays / 3)),
        deliverables: ['Vector SVG source', 'Print-ready PDF', 'Asset exports bundle'],
      },
    ],
  };

  return validateAndBalanceContract(raw);
}

export function validateAndBalanceContract(rawContract: any): ParsedContract {
  const parsed = ContractSchema.parse(rawContract);

  // Invariant 1: First milestone cannot exceed 50%
  if (parsed.milestones[0].amount > parsed.total_amount * 0.5) {
    parsed.milestones[0].amount = Math.round(parsed.total_amount * 0.4 * 100) / 100;
  }

  // Invariant 2: Mathematical Sum Check & Rounding Self-Correction
  const sum = parsed.milestones.reduce((acc, m) => acc + m.amount, 0);
  const diff = Math.round((parsed.total_amount - sum) * 100) / 100;

  if (Math.abs(diff) > 0) {
    // Balance rounding delta onto the final milestone
    const lastIdx = parsed.milestones.length - 1;
    parsed.milestones[lastIdx].amount = Math.round((parsed.milestones[lastIdx].amount + diff) * 100) / 100;
  }

  return parsed as ParsedContract;
}
