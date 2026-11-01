import { Router, Request, Response } from 'express';
import express from 'express';
import { verifyWebhook } from '../services/paypal';
import { db } from '../services/db';

const router = Router();

function lowercaseHeaders(headers: Record<string, any>): Record<string, string> {
  const normalized: Record<string, string> = {};
  for (const [k, v] of Object.entries(headers)) {
    normalized[k.toLowerCase()] = String(v);
  }
  return normalized;
}

// POST /webhooks/paypal - Webhook receiver with exact byte signature verification
router.post('/webhooks/paypal', express.raw({ type: '*/*' }), async (req: Request, res: Response) => {
  try {
    const rawBody = req.body.toString('utf8');
    const headers = lowercaseHeaders(req.headers);

    const isValid = await verifyWebhook(headers, rawBody);
    if (!isValid) {
      console.warn('[Webhook] Invalid signature received from PayPal.');
      return res.status(400).send('Invalid webhook signature');
    }

    const event = JSON.parse(rawBody);
    const eventId = event.id;

    // Deduplication check: drop duplicate deliveries
    const isNew = await db.insertEventIfNew(eventId);
    if (!isNew) {
      // Fast ACK to PayPal without reprocessing
      return res.status(200).json({ status: 'DUPLICATE_IGNORED' });
    }

    // Acknowledge PayPal receipt immediately
    res.status(200).json({ status: 'RECEIVED' });

    // Handle asynchronous event
    await processPayPalEvent(event);
  } catch (err: any) {
    console.error('[Webhook Error]', err);
    res.status(500).send('Webhook processing error');
  }
});

async function processPayPalEvent(event: any) {
  const eventType = event.event_type;
  const resource = event.resource;

  console.log(`[Webhook Event] Processing ${eventType} (${event.id})`);

  switch (eventType) {
    case 'PAYMENT.AUTHORIZATION.CREATED': {
      // Authorization created
      const customId = resource.custom_id || resource.reference_id;
      if (customId) {
        await db.updateProject(customId, {
          paypal_authorization_id: resource.id,
          status: 'AUTHORIZED',
        });
      }
      break;
    }

    case 'PAYMENT.AUTHORIZATION.VOIDED': {
      // Authorization voided
      const customId = resource.custom_id;
      if (customId) {
        await db.updateProject(customId, { status: 'CANCELLED' });
      }
      break;
    }

    case 'PAYMENT.CAPTURE.COMPLETED': {
      // Capture completed
      const milestoneId = resource.invoice_id;
      if (milestoneId) {
        await db.updateMilestone(milestoneId, 'CAPTURED', { paypal_capture_id: resource.id });
      }
      break;
    }

    case 'PAYMENT.CAPTURE.DENIED': {
      const milestoneId = resource.invoice_id;
      if (milestoneId) {
        await db.updateMilestone(milestoneId, 'FAILED');
      }
      break;
    }

    case 'PAYMENT.PAYOUTS-ITEM.SUCCEEDED': {
      const milestoneId = resource.sender_item_id?.replace('item-', '');
      if (milestoneId) {
        await db.updateMilestone(milestoneId, 'PAID_OUT');
      }
      break;
    }

    case 'PAYMENT.PAYOUTS-ITEM.FAILED': {
      const milestoneId = resource.sender_item_id?.replace('item-', '');
      if (milestoneId) {
        await db.updateMilestone(milestoneId, 'FAILED');
      }
      break;
    }

    default:
      console.log(`[Webhook Event] Unhandled event type: ${eventType}`);
  }
}

export default router;
