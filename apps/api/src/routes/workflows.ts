import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { validateBody } from '../middleware/validate';
import { db } from '../services/db';
import { executeMilestoneRelease } from './milestones';

const router = Router();

const VerifyCallbackSchema = z.object({
  submissionId: z.string(),
  score: z.number().min(0).max(100),
  report: z.record(z.any()),
});

router.post('/workflows/verify', validateBody(VerifyCallbackSchema), async (req: Request, res: Response) => {
  const incomingSecret = req.headers['x-internal-secret'];
  const expectedSecret = process.env.INTERNAL_WORKFLOW_SECRET || 'long-random-string';

  if (!incomingSecret || incomingSecret !== expectedSecret) {
    return res.status(403).json({
      error: { code: 'FORBIDDEN', message: 'Invalid or missing X-Internal-Secret header.' },
    });
  }

  const { submissionId, score, report } = req.body;
  const submission = await db.getSubmissionById(submissionId);
  if (!submission) {
    return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Submission not found' } });
  }

  const milestone = await db.getMilestoneById(submission.milestone_id);
  if (!milestone) {
    return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Milestone not found' } });
  }

  const project = await db.getProjectById(milestone.project_id);
  if (!project) {
    return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Project not found' } });
  }

  const AUTO_APPROVE_THRESHOLD = Number(process.env.AUTO_APPROVE_THRESHOLD || 80);
  const MANUAL_REVIEW_THRESHOLD = Number(process.env.MANUAL_REVIEW_THRESHOLD || 50);
  const MAX_AUTO_APPROVE_AMOUNT = Number(process.env.MAX_AUTO_APPROVE_AMOUNT || 500);

  let decision = 'AUTO_REJECTED';
  let newMilestoneStatus = 'REJECTED';

  // Decision logic lives on the server, not in the model output
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

  await db.updateSubmission(submission.id, {
    ai_verification_score: score,
    ai_report_json: report,
    decision,
  });

  await db.updateMilestone(milestone.id, newMilestoneStatus as any);

  // If AUTO_APPROVED, execute release
  if (decision === 'AUTO_APPROVED') {
    const freelancer = project.freelancer_id ? await db.getUserById(project.freelancer_id) : null;
    const freelancerEmail = freelancer?.paypal_email || freelancer?.email || 'freelancer@escrowmind.demo';

    const release = await executeMilestoneRelease(milestone, project, freelancerEmail, submission.id);

    return res.json({
      decision: 'AUTO_APPROVED',
      status: 'PAID_OUT',
      captureId: release.captureId,
      payoutBatchId: release.payoutBatchId,
    });
  }

  res.json({
    decision,
    status: newMilestoneStatus,
    score,
    summary: report.summary_for_client || 'Verification complete.',
  });
});

export default router;
