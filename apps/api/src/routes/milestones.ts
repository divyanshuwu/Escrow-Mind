import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { requireAuth, requireRole } from '../middleware/auth';
import { validateBody } from '../middleware/validate';
import { db } from '../services/db';
import { createSignedUploadUrl } from '../services/storage';
import { triggerVerificationWorkflow } from '../services/workflowRunner';
import { capturePartial, sendPayout, refundCapture } from '../services/paypal';
import { generateAIEvidencePacket } from '../services/verifierAgent';
import { Milestone, Project, Submission } from '../types';

const router = Router();

// Core release helper: performs PayPal partial capture and payout
export async function executeMilestoneRelease(
  m: Milestone,
  p: Project,
  freelancerEmail: string,
  submissionId?: string
) {
  if (!p.paypal_authorization_id) {
    throw new Error('Project has no active PayPal authorization hold.');
  }

  const remaining = Number(p.total_amount) - Number(p.captured_total);
  const isFinal = Math.abs(remaining - Number(m.amount)) < 0.005; // Last milestone

  // 1. Partial Capture against hold
  const cap = await capturePartial(
    p.paypal_authorization_id,
    m.id,
    m.amount.toFixed(2),
    isFinal
  );

  if (cap.status !== 'COMPLETED' && cap.status !== 'PENDING') {
    throw new Error(`PayPal Capture status: ${cap.status}`);
  }

  // 2. Platform fee deduction calculation
  const feePercent = Number(process.env.PLATFORM_FEE_PERCENT || 0);
  const feeAmount = Math.round(((m.amount * feePercent) / 100) * 100) / 100;
  const netPayout = Math.max(0, m.amount - feeAmount);

  // 3. Update Project captured total and ledger
  const newCapturedTotal = Number(p.captured_total) + Number(m.amount);
  await db.updateProject(p.id, {
    captured_total: newCapturedTotal,
    status: isFinal ? 'COMPLETED' : 'IN_PROGRESS',
  });

  await db.recordLedger('CAPTURE', p.id, m.id, m.amount, cap.id, feeAmount);
  if (feeAmount > 0) {
    await db.recordLedger('FEE', p.id, m.id, feeAmount, `fee-${cap.id}`);
  }

  // 4. Update Milestone status atomically
  await db.updateMilestone(m.id, 'CAPTURED', { paypal_capture_id: cap.id });

  // 5. Send PayPal Payout to freelancer
  const payout = await sendPayout(m.id, freelancerEmail, netPayout.toFixed(2));
  const batchId = payout.batch_header?.payout_batch_id || `batch-${Date.now()}`;

  await db.recordLedger('PAYOUT', p.id, m.id, netPayout, batchId);
  await db.updateMilestone(m.id, 'PAID_OUT', { paypal_payout_batch_id: batchId });

  if (submissionId) {
    await db.updateSubmission(submissionId, {
      paypal_capture_id: cap.id,
      paypal_payout_batch_id: batchId,
    });
  }

  return { captureId: cap.id, payoutBatchId: batchId, isFinal };
}

// 1. GET /milestones/:id - Milestone detail with submissions
router.get('/milestones/:id', requireAuth, async (req: Request, res: Response) => {
  const milestone = await db.getMilestoneById(req.params.id);
  if (!milestone) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Milestone not found' } });

  const submissions = await db.getSubmissionsByMilestoneId(milestone.id);
  const dispute = await db.getDisputeByMilestoneId(milestone.id);

  res.json({ milestone, submissions, dispute });
});

// 2. POST /milestones/:id/upload-url - Signed upload URL
const UploadUrlSchema = z.object({
  filename: z.string(),
  contentType: z.string(),
});

router.post('/milestones/:id/upload-url', requireAuth, requireRole('freelancer'), validateBody(UploadUrlSchema), async (req: Request, res: Response) => {
  const milestone = await db.getMilestoneById(req.params.id);
  if (!milestone) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Milestone not found' } });

  try {
    const uploadData = await createSignedUploadUrl(milestone.id, req.body.filename, req.body.contentType);
    res.json(uploadData);
  } catch (err: any) {
    res.status(400).json({ error: { code: 'UPLOAD_URL_FAILED', message: err.message } });
  }
});

// 3. POST /milestones/:id/submit - Submit deliverables & trigger verification
const SubmitSchema = z.object({
  paths: z.array(z.string()).min(1),
  note: z.string().optional(),
});

router.post('/milestones/:id/submit', requireAuth, requireRole('freelancer'), validateBody(SubmitSchema), async (req: Request, res: Response) => {
  const milestone = await db.getMilestoneById(req.params.id);
  if (!milestone) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Milestone not found' } });

  if (milestone.status !== 'PENDING' && milestone.status !== 'REJECTED') {
    return res.status(409).json({
      error: { code: 'INVALID_STATE', message: `Cannot submit milestone in status '${milestone.status}'.` },
    });
  }

  // Sequential guard: Check that all prior milestones are verified/captured
  const allMilestones = await db.getMilestonesByProjectId(milestone.project_id);
  const priorUnfinished = allMilestones.find(
    (m) => m.seq < milestone.seq && !['VERIFIED', 'CAPTURED', 'PAID_OUT'].includes(m.status)
  );
  if (priorUnfinished) {
    return res.status(409).json({
      error: {
        code: 'SEQUENTIAL_GUARD_FAILED',
        message: `Milestone ${priorUnfinished.seq} ('${priorUnfinished.title}') must be verified before submitting Milestone ${milestone.seq}.`,
      },
    });
  }

  const submissionId = `sub-${Date.now().toString(36)}`;
  const submission: Submission = {
    id: submissionId,
    milestone_id: milestone.id,
    file_urls: req.body.paths,
    note: req.body.note,
    decision: 'PENDING_VERIFICATION',
  };

  await db.createSubmission(submission);
  await db.updateMilestone(milestone.id, 'VERIFYING');

  const workflowRunId = await triggerVerificationWorkflow(submissionId);

  res.status(202).json({
    submissionId,
    status: 'VERIFYING',
    workflowRunId,
  });
});

// 4. POST /milestones/:id/review - Client manual review (score 50-79)
const ReviewSchema = z.object({
  decision: z.enum(['APPROVE', 'REJECT']),
  comment: z.string().optional(),
});

router.post('/milestones/:id/review', requireAuth, requireRole('client'), validateBody(ReviewSchema), async (req: Request, res: Response) => {
  const milestone = await db.getMilestoneById(req.params.id);
  if (!milestone) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Milestone not found' } });

  if (milestone.status !== 'NEEDS_CLIENT_REVIEW') {
    return res.status(409).json({
      error: { code: 'INVALID_STATE', message: 'Milestone is not awaiting client review.' },
    });
  }

  const project = await db.getProjectById(milestone.project_id);
  if (!project) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Project not found' } });

  const submissions = await db.getSubmissionsByMilestoneId(milestone.id);
  const latestSub = submissions[submissions.length - 1];

  if (req.body.decision === 'APPROVE') {
    const freelancer = project.freelancer_id ? await db.getUserById(project.freelancer_id) : null;
    const freelancerEmail = freelancer?.paypal_email || freelancer?.email || 'freelancer@escrowmind.demo';

    await db.updateSubmission(latestSub.id, { decision: 'CLIENT_APPROVED' });
    await db.updateMilestone(milestone.id, 'VERIFIED');

    const releaseResult = await executeMilestoneRelease(milestone, project, freelancerEmail, latestSub.id);

    res.json({
      status: 'CAPTURED',
      captureId: releaseResult.captureId,
      payoutBatchId: releaseResult.payoutBatchId,
    });
  } else {
    await db.updateSubmission(latestSub.id, { decision: 'CLIENT_REJECTED' });
    await db.updateMilestone(milestone.id, 'REJECTED');
    res.json({ status: 'REJECTED', message: 'Milestone rejected by client.' });
  }
});

// 5. POST /milestones/:id/dispute - Flag milestone as disputed
const DisputeSchema = z.object({
  reason: z.string().min(5),
});

router.post('/milestones/:id/dispute', requireAuth, requireRole('client'), validateBody(DisputeSchema), async (req: Request, res: Response) => {
  const milestone = await db.getMilestoneById(req.params.id);
  if (!milestone) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Milestone not found' } });

  const project = await db.getProjectById(milestone.project_id);
  if (!project) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Project not found' } });

  const submissions = await db.getSubmissionsByMilestoneId(milestone.id);
  const latestSub = submissions[submissions.length - 1];

  // Synthesize immutable AI Evidence Packet
  const mockReport = latestSub?.ai_report_json || { score: 60, deliverables: [], flags: [] };
  const evidencePacket = generateAIEvidencePacket(
    project.raw_prompt,
    milestone,
    latestSub?.file_urls || [],
    mockReport as any,
    req.body.reason
  );

  const disputeId = `disp-${Date.now().toString(36)}`;
  await db.createDispute({
    id: disputeId,
    milestone_id: milestone.id,
    client_id: req.user!.id,
    reason: req.body.reason,
    evidence_packet: evidencePacket,
    status: 'OPEN',
  });

  await db.updateMilestone(milestone.id, 'DISPUTED');

  res.json({
    disputeId,
    status: 'DISPUTED',
    message: 'Milestone frozen. AI Evidence Packet generated for administrative arbitration.',
  });
});

// 6. POST /milestones/:id/resolve-dispute - Admin arbitration
const ResolveDisputeSchema = z.object({
  action: z.enum(['RELEASE', 'REFUND']),
  notes: z.string().min(3),
});

router.post('/milestones/:id/resolve-dispute', requireAuth, requireRole('admin'), validateBody(ResolveDisputeSchema), async (req: Request, res: Response) => {
  const milestone = await db.getMilestoneById(req.params.id);
  if (!milestone) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Milestone not found' } });

  const dispute = await db.getDisputeByMilestoneId(milestone.id);
  if (!dispute) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'No dispute open for this milestone.' } });

  const project = await db.getProjectById(milestone.project_id);
  if (!project) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Project not found' } });

  if (req.body.action === 'RELEASE') {
    const freelancer = project.freelancer_id ? await db.getUserById(project.freelancer_id) : null;
    const freelancerEmail = freelancer?.paypal_email || freelancer?.email || 'freelancer@escrowmind.demo';

    await db.updateMilestone(milestone.id, 'VERIFIED');
    const release = await executeMilestoneRelease(milestone, project, freelancerEmail);

    await db.updateDispute(dispute.id, {
      status: 'RELEASED',
      resolution_notes: req.body.notes,
      resolved_at: new Date().toISOString(),
    });

    res.json({
      disputeStatus: 'RESOLVED',
      action: 'RELEASE',
      milestoneStatus: 'PAID_OUT',
      transactionId: release.payoutBatchId,
    });
  } else {
    // REFUND: If milestone was already captured, issue partial refund; otherwise leave uncaptured
    if (milestone.paypal_capture_id) {
      await refundCapture(milestone.paypal_capture_id, milestone.amount.toFixed(2));
      await db.recordLedger('REFUND', project.id, milestone.id, milestone.amount, `ref-${milestone.paypal_capture_id}`);
    }

    await db.updateMilestone(milestone.id, 'REJECTED');
    await db.updateDispute(dispute.id, {
      status: 'REFUNDED',
      resolution_notes: req.body.notes,
      resolved_at: new Date().toISOString(),
    });

    res.json({
      disputeStatus: 'RESOLVED',
      action: 'REFUND',
      milestoneStatus: 'REJECTED',
      message: 'Hold funds released back to client.',
    });
  }
});

export default router;
