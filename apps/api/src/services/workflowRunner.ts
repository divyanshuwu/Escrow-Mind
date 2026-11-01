import { db } from './db';
import { auditDeliverables } from './verifierAgent';
import { verifyFreelancerPortfolio } from './kernel';
import { getSignedDownloadUrls } from './storage';

export async function triggerVerificationWorkflow(submissionId: string): Promise<string> {
  const workflowRunId = `run_${Date.now().toString(36)}`;

  // If Render Workflows is configured in production
  if (process.env.RENDER_WORKFLOW_TOKEN && process.env.NODE_ENV === 'production') {
    try {
      await fetch('https://api.render.com/v1/workflows/verify-submission/runs', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.RENDER_WORKFLOW_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ submissionId }),
      });
      return workflowRunId;
    } catch (err: any) {
      console.warn('Render Workflows dispatch failed, falling back to in-process worker:', err.message);
    }
  }

  // Dual-Engine Local In-Process Async Worker
  setImmediate(async () => {
    try {
      await runInProcessVerification(submissionId);
    } catch (err: any) {
      console.error(`In-process verification failed for submission ${submissionId}:`, err);
    }
  });

  return workflowRunId;
}

export async function runInProcessVerification(submissionId: string): Promise<void> {
  const submission = await db.getSubmissionById(submissionId);
  if (!submission) return;

  const milestone = await db.getMilestoneById(submission.milestone_id);
  if (!milestone) return;

  const project = await db.getProjectById(milestone.project_id);
  if (!project) return;

  const freelancer = project.freelancer_id
    ? await db.getUserById(project.freelancer_id)
    : null;

  // Step 1: Storage retrieval
  const signedUrls = await getSignedDownloadUrls(submission.file_urls);

  // Step 2: KERNEL Portfolio trust check (gracefully degraded on timeout)
  const portfolioResult = await verifyFreelancerPortfolio(freelancer?.portfolio_url);

  // Step 3: Verifier Agent vision/rubric audit
  const report = await auditDeliverables(
    milestone,
    submission.file_urls,
    submission.note,
    portfolioResult
  );

  // Step 4: Callback to internal workflow endpoint
  const internalSecret = process.env.INTERNAL_WORKFLOW_SECRET || 'long-random-string';
  const appUrl = process.env.APP_URL || `http://localhost:${process.env.PORT || 8080}`;

  await fetch(`${appUrl}/api/workflows/verify`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Internal-Secret': internalSecret,
    },
    body: JSON.stringify({
      submissionId,
      score: report.score,
      report,
    }),
  }).catch(async () => {
    // If HTTP callback fails (e.g., during unit tests where server isn't listening on port),
    // apply decision logic directly
    await handleVerificationResultDirectly(submissionId, report.score, report);
  });
}

export async function handleVerificationResultDirectly(
  submissionId: string,
  score: number,
  report: any
) {
  const submission = await db.getSubmissionById(submissionId);
  if (!submission) return;

  const milestone = await db.getMilestoneById(submission.milestone_id);
  if (!milestone) return;

  const project = await db.getProjectById(milestone.project_id);
  if (!project) return;

  const AUTO_APPROVE_THRESHOLD = Number(process.env.AUTO_APPROVE_THRESHOLD || 80);
  const MANUAL_REVIEW_THRESHOLD = Number(process.env.MANUAL_REVIEW_THRESHOLD || 50);
  const MAX_AUTO_APPROVE_AMOUNT = Number(process.env.MAX_AUTO_APPROVE_AMOUNT || 500);

  let decision = 'AUTO_REJECTED';
  let newMilestoneStatus = 'REJECTED';

  // Safety rule: Milestones > $500 never auto-approve
  if (score >= AUTO_APPROVE_THRESHOLD && milestone.amount <= MAX_AUTO_APPROVE_AMOUNT) {
    decision = 'AUTO_APPROVED';
    newMilestoneStatus = 'VERIFIED';
  } else if (score >= MANUAL_REVIEW_THRESHOLD) {
    decision = 'NEEDS_REVIEW';
    newMilestoneStatus = 'NEEDS_CLIENT_REVIEW';
  } else {
    decision = 'AUTO_REJECTED';
    newMilestoneStatus = 'REJECTED';
  }

  await db.updateSubmission(submissionId, {
    ai_verification_score: score,
    ai_report_json: report,
    decision,
  });

  await db.updateMilestone(milestone.id, newMilestoneStatus as any);

  // If AUTO_APPROVED, execute capture and payout
  if (decision === 'AUTO_APPROVED') {
    const { executeMilestoneRelease } = await import('../routes/milestones');
    const freelancer = project.freelancer_id ? await db.getUserById(project.freelancer_id) : null;
    const freelancerEmail = freelancer?.paypal_email || freelancer?.email || 'freelancer@escrowmind.demo';
    await executeMilestoneRelease(milestone, project, freelancerEmail, submissionId);
  }
}
