import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { requireAuth, requireRole } from '../middleware/auth';
import { validateBody } from '../middleware/validate';
import { db } from '../services/db';
import { createAuthorizeOrder, authorizeOrder } from '../services/paypal';

const router = Router();

// 1. POST /paypal/orders - Create intent: AUTHORIZE order
const CreateOrderSchema = z.object({
  projectId: z.string(),
});

router.post('/paypal/orders', requireAuth, requireRole('client'), validateBody(CreateOrderSchema), async (req: Request, res: Response) => {
  const { projectId } = req.body;
  const project = await db.getProjectById(projectId);

  if (!project) {
    return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Project not found' } });
  }

  if (project.status !== 'AWAITING_APPROVAL') {
    return res.status(409).json({
      error: { code: 'INVALID_STATE', message: `Cannot create PayPal order in status '${project.status}'.` },
    });
  }

  try {
    const orderData = await createAuthorizeOrder(project.id, project.total_amount.toFixed(2));
    const orderId = orderData.id;

    await db.updateProject(project.id, { paypal_order_id: orderId });

    res.json({ orderId });
  } catch (err: any) {
    res.status(502).json({
      error: { code: 'PAYPAL_ORDER_FAILED', message: err.message, debugId: err.debugId },
    });
  }
});

// 2. POST /paypal/authorize - Authorize approved order
const AuthorizeOrderSchema = z.object({
  projectId: z.string(),
  orderId: z.string(),
});

router.post('/paypal/authorize', requireAuth, requireRole('client'), validateBody(AuthorizeOrderSchema), async (req: Request, res: Response) => {
  const { projectId, orderId } = req.body;
  const project = await db.getProjectById(projectId);

  if (!project) {
    return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Project not found' } });
  }

  try {
    const authData = await authorizeOrder(orderId);
    
    // Extract authorization ID from PayPal response structure
    let authorizationId = authData.id;
    if (authData.purchase_units?.[0]?.payments?.authorizations?.[0]?.id) {
      authorizationId = authData.purchase_units[0].payments.authorizations[0].id;
    }
    const expiresAt = authData.purchase_units?.[0]?.payments?.authorizations?.[0]?.expiration_time ||
      new Date(Date.now() + 29 * 86400000).toISOString();

    await db.updateProject(project.id, {
      paypal_authorization_id: authorizationId,
      authorized_at: new Date().toISOString(),
      authorization_expires_at: expiresAt,
      status: 'AUTHORIZED',
    });

    // Record hold in append-only money ledger
    await db.recordLedger('AUTHORIZE', project.id, undefined, project.total_amount, authorizationId);

    res.json({
      authorizationId,
      expiresAt,
      status: 'AUTHORIZED',
    });
  } catch (err: any) {
    res.status(502).json({
      error: { code: 'PAYPAL_AUTHORIZATION_FAILED', message: err.message, debugId: err.debugId },
    });
  }
});

export default router;
