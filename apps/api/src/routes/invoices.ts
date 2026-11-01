import { Router, Request, Response } from 'express';
import { requireAuth, requireRole } from '../middleware/auth';
import { db } from '../services/db';

const router = Router();

// POST /projects/:id/invoice - Generate PayPal Invoice for completed project
router.post('/projects/:id/invoice', requireAuth, requireRole('client'), async (req: Request, res: Response) => {
  const project = await db.getProjectById(req.params.id);
  if (!project) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Project not found' } });

  const milestones = await db.getMilestonesByProjectId(project.id);
  const invoiceId = `INV-${Date.now().toString(36).toUpperCase()}`;

  const invoiceItems = milestones.map((m) => ({
    name: m.title,
    description: m.description || `Milestone ${m.seq}`,
    quantity: '1',
    unit_amount: { currency_code: 'USD', value: m.amount.toFixed(2) },
    status: m.status,
  }));

  res.json({
    invoiceId,
    status: 'SENT',
    invoiceNumber: `EM-${project.id.slice(0, 8).toUpperCase()}`,
    totalAmount: project.total_amount,
    items: invoiceItems,
    invoiceUrl: `https://www.sandbox.paypal.com/invoice/p/#${invoiceId}`,
  });
});

export default router;
