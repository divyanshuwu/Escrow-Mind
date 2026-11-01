import { Router, Request, Response } from 'express';
import { requireAuth } from '../middleware/auth';
import { db } from '../services/db';

const router = Router();

// GET /projects/:id/ledger - Returns append-only money ledger entries
router.get('/projects/:id/ledger', requireAuth, async (req: Request, res: Response) => {
  const project = await db.getProjectById(req.params.id);
  if (!project) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Project not found' } });

  const ledger = await db.getLedgerByProjectId(project.id);
  res.json({
    projectId: project.id,
    totalAuthorized: project.total_amount,
    capturedTotal: project.captured_total,
    remainingToCapture: project.total_amount - project.captured_total,
    entries: ledger,
  });
});

export default router;
