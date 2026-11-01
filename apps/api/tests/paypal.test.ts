import {
  createAuthorizeOrder,
  authorizeOrder,
  capturePartial,
  reauthorize,
  voidAuthorization,
  sendPayout,
  verifyWebhook,
} from '../src/services/paypal';

describe('PayPal Service Unit Tests', () => {
  const testProjectId = 'test-proj-001';
  const testMilestoneId = 'test-ms-001';

  test('createAuthorizeOrder requests intent: AUTHORIZE for escrow reservation', async () => {
    const order = await createAuthorizeOrder(testProjectId, '200.00');

    expect(order.id).toBeDefined();
    expect(order.status).toBe('CREATED');
    expect(order.intent).toBe('AUTHORIZE');
  });

  test('authorizeOrder holds funds on buyer payment method', async () => {
    const authResult = await authorizeOrder('ORDER-TEST-001');

    expect(authResult.id).toBeDefined();
    expect(authResult.status).toBe('CREATED');
  });

  test('capturePartial supports final_capture: false for intermediate milestone', async () => {
    const capture = await capturePartial('AUTH-001', testMilestoneId, '50.00', false);

    expect(capture.id).toBeDefined();
    expect(capture.status).toBe('COMPLETED');
    expect(capture.final_capture).toBe(false);
  });

  test('capturePartial supports final_capture: true for final milestone closing hold', async () => {
    const finalCapture = await capturePartial('AUTH-001', testMilestoneId, '80.00', true);

    expect(finalCapture.id).toBeDefined();
    expect(finalCapture.status).toBe('COMPLETED');
    expect(finalCapture.final_capture).toBe(true);
  });

  test('reauthorize extends the authorization validity window', async () => {
    const renew = await reauthorize('AUTH-001', '150.00');

    expect(renew.id).toBeDefined();
    expect(renew.status).toBe('CREATED');
  });

  test('voidAuthorization cleanly voids uncaptured hold', async () => {
    const voidResult = await voidAuthorization('AUTH-001');

    expect(voidResult.status).toBe('VOIDED');
  });

  test('sendPayout dispatches instant transfer via PayPal Payouts', async () => {
    const payout = await sendPayout(testMilestoneId, 'freelancer@sandbox.paypal.com', '50.00');

    expect(payout.batch_header).toBeDefined();
    expect(payout.batch_header.payout_batch_id).toBeDefined();
    expect(payout.batch_header.batch_status).toBe('SUCCESS');
  });

  test('verifyWebhook validates transmission signatures', async () => {
    const mockHeaders = {
      'paypal-auth-algo': 'SHA256withRSA',
      'paypal-cert-url': 'https://api.sandbox.paypal.com/cert',
      'paypal-transmission-id': 'trans-123',
      'paypal-transmission-sig': 'sig-xyz',
      'paypal-transmission-time': new Date().toISOString(),
    };
    const mockPayload = JSON.stringify({ event_type: 'PAYMENT.CAPTURE.COMPLETED' });

    const isValid = await verifyWebhook(mockHeaders, mockPayload);
    expect(isValid).toBe(true);
  });
});
