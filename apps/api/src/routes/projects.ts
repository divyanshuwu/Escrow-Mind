import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { requireAuth, requireRole } from '../middleware/auth';
import { validateBody } from '../middleware/validate';
import { parseContractPrompt } from '../services/contractAgent';
import { db } from '../services/db';
import { voidAuthorization } from '../services/paypal';
import { Project, Milestone } from '../types';

const router = Router();

// 1. POST /projects/parse - Parse natural language into structured contract
const ParsePromptSchema = z.object({
  prompt: z.string().min(3),
});

router.post('/projects/parse', requireAuth, validateBody(ParsePromptSchema), async (req: Request, res: Response) => {
  try {
    const contract = await parseContractPrompt(req.body.prompt);
    res.json(contract);
  } catch (err: any) {
    res.status(400).json({
      error: { code: 'PARSE_FAILED', message: err.message },
    });
  }
});

// 2. POST /projects - Persist confirmed contract
const CreateProjectSchema = z.object({
  rawPrompt: z.string(),
  contract: z.object({
    total_amount: z.number().min(5).max(10000),
    currency: z.string().default('USD'),
    deadline_days: z.number(),
    deliverable_type: z.string(),
    milestones: z.array(
      z.object({
        seq: z.number(),
        title: z.string(),
        description: z.string().optional(),
        amount: z.number().positive(),
        deadline_days: z.number().optional(),
        deliverables: z.array(z.string()),
      })
    ).min(1),
  }),
});

router.post('/projects', requireAuth, requireRole('client'), validateBody(CreateProjectSchema), async (req: Request, res: Response) => {
  try {
    const { rawPrompt, contract } = req.body;
    const clientId = req.user!.id;

    // Invariant check: milestone sum === total_amount
    const sum = contract.milestones.reduce((acc: number, m: any) => acc + Number(m.amount), 0);
    if (Math.abs(sum - Number(contract.total_amount)) > 0.005) {
      return res.status(422).json({
        error: {
          code: 'CONTRACT_SUM_MISMATCH',
          message: `Sum of milestones ($${sum}) does not equal project total ($${contract.total_amount})`,
        },
      });
    }

    const projectId = `proj-${Date.now().toString(36)}`;
    const newProject: Project = {
      id: projectId,
      client_id: clientId,
      raw_prompt: rawPrompt,
      total_amount: contract.total_amount,
      currency: contract.currency || 'USD',
      captured_total: 0,
      status: 'AWAITING_APPROVAL',
      created_at: new Date().toISOString(),
    };

    await db.createProject(newProject);

    // Create milestones
    for (const m of contract.milestones) {
      const milestoneId = `ms-${projectId}-${m.seq}`;
      const newMilestone: Milestone = {
        id: milestoneId,
        project_id: projectId,
        seq: m.seq,
        title: m.title,
        description: m.description,
        amount: m.amount,
        deliverables: m.deliverables,
        status: 'PENDING',
      };
      await db.createMilestone(newMilestone);
    }

    res.status(201).json({
      projectId,
      status: 'AWAITING_APPROVAL',
      totalAmount: contract.total_amount,
    });
  } catch (err: any) {
    res.status(500).json({ error: { code: 'PROJECT_CREATION_FAILED', message: err.message } });
  }
});

// 3. GET /projects - List user projects
router.get('/projects', requireAuth, async (req: Request, res: Response) => {
  const projects = await db.listProjectsForUser(req.user!.id);
  res.json({ projects });
});

// 4. GET /projects/:id - Project details with milestones
router.get('/projects/:id', requireAuth, async (req: Request, res: Response) => {
  const project = await db.getProjectById(req.params.id);
  if (!project) {
    return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Project not found' } });
  }

  const milestones = await db.getMilestonesByProjectId(project.id);
  const ledger = await db.getLedgerByProjectId(project.id);

  res.json({ project, milestones, ledger });
});

// 5. PATCH /projects/:id/milestones - Edit milestones before authorization
const UpdateMilestonesSchema = z.object({
  milestones: z.array(
    z.object({
      id: z.string(),
      title: z.string().optional(),
      description: z.string().optional(),
      amount: z.number().positive().optional(),
    })
  ),
});

router.patch('/projects/:id/milestones', requireAuth, requireRole('client'), validateBody(UpdateMilestonesSchema), async (req: Request, res: Response) => {
  const project = await db.getProjectById(req.params.id);
  if (!project) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Project not found' } });

  if (project.status !== 'AWAITING_APPROVAL' && project.status !== 'DRAFT') {
    return res.status(409).json({
      error: { code: 'INVALID_STATE', message: 'Cannot edit milestones after project authorization.' },
    });
  }

  for (const mUpdate of req.body.milestones) {
    await db.updateMilestone(mUpdate.id, 'PENDING', mUpdate);
  }

  const updatedMilestones = await db.getMilestonesByProjectId(project.id);
  res.json({ milestones: updatedMilestones });
});

// 6. POST /projects/:id/assign - Assign freelancer by email
const AssignFreelancerSchema = z.object({
  freelancerEmail: z.string().email(),
});

router.post('/projects/:id/assign', requireAuth, requireRole('client'), validateBody(AssignFreelancerSchema), async (req: Request, res: Response) => {
  const project = await db.getProjectById(req.params.id);
  if (!project) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Project not found' } });

  let freelancer = await db.getUserByEmail(req.body.freelancerEmail);
  if (!freelancer) {
    // Automatically register demo freelancer
    freelancer = await db.createUser({
      id: `fl-${Date.now().toString(36)}`,
      email: req.body.freelancerEmail,
      paypal_email: req.body.freelancerEmail,
      role: 'freelancer',
    });
  }

  await db.updateProject(project.id, { freelancer_id: freelancer.id });
  res.json({ message: 'Freelancer assigned successfully', freelancerId: freelancer.id });
});

// 7. POST /projects/:id/cancel - Void hold and cancel project
router.post('/projects/:id/cancel', requireAuth, requireRole('client'), async (req: Request, res: Response) => {
  const project = await db.getProjectById(req.params.id);
  if (!project) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Project not found' } });

  if (project.paypal_authorization_id) {
    try {
      await voidAuthorization(project.paypal_authorization_id);
      await db.recordLedger('VOID', project.id, undefined, project.total_amount - project.captured_total, `void-${project.paypal_authorization_id}`);
    } catch (e: any) {
      console.warn('Void call returned:', e.message);
    }
  }

  const updated = await db.updateProject(project.id, { status: 'CANCELLED' });
  res.json({ status: 'CANCELLED', project: updated });
});

export default router;
