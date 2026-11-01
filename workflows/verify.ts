/**
 * Render Workflows Pipeline Definition
 * Durable async verification workflow for EscrowMind
 */

export interface VerifyWorkflowInput {
  submissionId: string;
}

export const verifySubmissionWorkflow = async (ctx: any, input: VerifyWorkflowInput) => {
  const { submissionId } = input;
  const backendUrl = process.env.APP_URL || 'https://escrowmind-api.onrender.com';
  const internalSecret = process.env.INTERNAL_WORKFLOW_SECRET || 'long-random-string';

  // Step 1: Load submission details from API
  const sub = await ctx.step('load-submission', async () => {
    const res = await fetch(`${backendUrl}/api/milestones/submissions/${submissionId}`, {
      headers: { 'X-Internal-Secret': internalSecret },
    });
    if (!res.ok) throw new Error(`Failed to load submission: ${res.status}`);
    return await res.json();
  });

  // Step 2: Retrieve short-lived signed URLs for deliverable files
  const files = await ctx.step('fetch-signed-urls', async () => {
    const res = await fetch(`${backendUrl}/api/storage/signed-urls`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Internal-Secret': internalSecret },
      body: JSON.stringify({ paths: sub.file_urls }),
    });
    return (await res.json()).urls;
  });

  // Step 3: Run GPT-4o Vision multimodal deliverable audit
  const visionReport = await ctx.step(
    'gpt4o-vision-audit',
    async () => {
      const res = await fetch(`${backendUrl}/api/internal/verifier/vision`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Internal-Secret': internalSecret },
        body: JSON.stringify({ milestone: sub.milestone, files }),
      });
      return await res.json();
    },
    { retries: 2, backoff: 'exponential' }
  );

  // Step 4: Run KERNEL autonomous browser session for portfolio trust
  const portfolioReport = await ctx.step(
    'kernel-portfolio-audit',
    async () => {
      try {
        const res = await fetch(`${backendUrl}/api/internal/kernel/portfolio`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Internal-Secret': internalSecret },
          body: JSON.stringify({ portfolioUrl: sub.freelancer?.portfolio_url }),
        });
        return await res.json();
      } catch (e) {
        return { checked: false, notes: 'Degraded to vision evaluation' };
      }
    },
    { retries: 1 }
  );

  // Step 5: Post verified telemetry to EscrowMind fiduciary decision engine
  const finalDecision = await ctx.step('fiduciary-decision-callback', async () => {
    const res = await fetch(`${backendUrl}/api/workflows/verify`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Internal-Secret': internalSecret,
      },
      body: JSON.stringify({
        submissionId,
        score: visionReport.score,
        report: {
          score: visionReport.score,
          deliverables: visionReport.deliverables,
          portfolio: portfolioReport,
          flags: visionReport.flags || [],
          summary_for_client: visionReport.summary_for_client,
        },
      }),
    });
    return await res.json();
  });

  return finalDecision;
};
