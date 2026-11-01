import request from 'supertest';
import { createApp } from '../src/app';
import { db } from '../src/services/db';

const app = createApp();

describe('EscrowMind End-to-End API Routes Integration Tests', () => {
  let projectId: string;
  let milestoneId: string;
  let submissionId: string;
  const clientToken = 'Bearer mock-client-jwt';
  const freelancerToken = 'Bearer mock-freelancer-jwt';
  const adminToken = 'Bearer mock-admin-jwt';

  beforeAll(() => {
    db.clearAll();
  });

  test('GET /healthz returns 200 OK with service telemetry', async () => {
    const res = await request(app).get('/healthz');
    expect(res.status).toBe(200);
    expect(res.body.service).toBe('escrowmind-api');
    expect(res.body.status).toBe('ok');
  });

  test('POST /api/projects/parse parses brief into 3 milestones', async () => {
    const res = await request(app)
      .post('/api/projects/parse')
      .set('Authorization', clientToken)
      .send({ prompt: 'Logo design, 3 days, $200' });

    expect(res.status).toBe(200);
    expect(res.body.total_amount).toBe(200);
    expect(res.body.milestones).toHaveLength(3);
  });

  test('POST /api/projects creates project in AWAITING_APPROVAL status', async () => {
    const contractPayload = {
      rawPrompt: 'Logo design, 3 days, $200',
      contract: {
        total_amount: 200,
        currency: 'USD',
        deadline_days: 3,
        deliverable_type: 'logo_design',
        milestones: [
          { seq: 1, title: 'Concepts', amount: 50, deliverables: ['PNG preview'] },
          { seq: 2, title: 'Revisions', amount: 70, deliverables: ['Revised PNG'] },
          { seq: 3, title: 'Final Delivery', amount: 80, deliverables: ['Vector SVG'] },
        ],
      },
    };

    const res = await request(app)
      .post('/api/projects')
      .set('Authorization', clientToken)
      .send(contractPayload);

    expect(res.status).toBe(201);
    expect(res.body.projectId).toBeDefined();
    expect(res.body.status).toBe('AWAITING_APPROVAL');

    projectId = res.body.projectId;

    // Fetch created project to grab milestone 1 ID
    const projDetail = await request(app)
      .get(`/api/projects/${projectId}`)
      .set('Authorization', clientToken);
    expect(projDetail.status).toBe(200);
    expect(projDetail.body.milestones).toHaveLength(3);
    milestoneId = projDetail.body.milestones[0].id;
  });

  test('POST /api/paypal/orders creates intent: AUTHORIZE order', async () => {
    const res = await request(app)
      .post('/api/paypal/orders')
      .set('Authorization', clientToken)
      .send({ projectId });

    expect(res.status).toBe(200);
    expect(res.body.orderId).toBeDefined();
  });

  test('POST /api/paypal/authorize executes authorization hold and records ledger', async () => {
    const res = await request(app)
      .post('/api/paypal/authorize')
      .set('Authorization', clientToken)
      .send({ projectId, orderId: 'ORDER-MOCK-123' });

    expect(res.status).toBe(200);
    expect(res.body.authorizationId).toBeDefined();
    expect(res.body.status).toBe('AUTHORIZED');

    // Verify ledger entry
    const ledgerRes = await request(app)
      .get(`/api/projects/${projectId}/ledger`)
      .set('Authorization', clientToken);
    expect(ledgerRes.body.entries[0].kind).toBe('AUTHORIZE');
    expect(ledgerRes.body.totalAuthorized).toBe(200);
  });

  test('POST /api/projects/:id/assign assigns freelancer to project', async () => {
    const res = await request(app)
      .post(`/api/projects/${projectId}/assign`)
      .set('Authorization', clientToken)
      .send({ freelancerEmail: 'freelancer@escrowmind.demo' });

    expect(res.status).toBe(200);
    expect(res.body.message).toContain('assigned');
  });

  test('POST /api/milestones/:id/submit submits deliverable and returns 202 Accepted', async () => {
    const res = await request(app)
      .post(`/api/milestones/${milestoneId}/submit`)
      .set('Authorization', freelancerToken)
      .send({
        paths: [`submissions/${milestoneId}/concept.png`],
        note: 'Here is the first milestone concept.',
      });

    expect(res.status).toBe(202);
    expect(res.body.submissionId).toBeDefined();
    expect(res.body.status).toBe('VERIFYING');

    submissionId = res.body.submissionId;
  });

  test('POST /api/workflows/verify with score 88 auto-captures and pays out milestone', async () => {
    const verifyPayload = {
      submissionId,
      score: 88,
      report: {
        score: 88,
        deliverables: [{ name: 'PNG preview', found: true, confidence: 0.95, reason: 'Matched' }],
        summary_for_client: 'All deliverables verified.',
      },
    };

    const res = await request(app)
      .post('/api/workflows/verify')
      .set('X-Internal-Secret', 'long-random-string')
      .send(verifyPayload);

    expect(res.status).toBe(200);
    expect(res.body.decision).toBe('AUTO_APPROVED');
    expect(res.body.status).toBe('PAID_OUT');
    expect(res.body.captureId).toBeDefined();
    expect(res.body.payoutBatchId).toBeDefined();

    // Verify money ledger reflects CAPTURE and PAYOUT
    const ledger = await request(app)
      .get(`/api/projects/${projectId}/ledger`)
      .set('Authorization', clientToken);
    const kinds = ledger.body.entries.map((e: any) => e.kind);
    expect(kinds).toContain('AUTHORIZE');
    expect(kinds).toContain('CAPTURE');
    expect(kinds).toContain('PAYOUT');
  });

  test('POST /api/milestones/:id/dispute and admin resolve-dispute flow', async () => {
    // Get Milestone 2
    const projDetail = await request(app)
      .get(`/api/projects/${projectId}`)
      .set('Authorization', clientToken);
    const m2Id = projDetail.body.milestones[1].id;

    // Freelancer submits M2
    await request(app)
      .post(`/api/milestones/${m2Id}/submit`)
      .set('Authorization', freelancerToken)
      .send({ paths: [`submissions/${m2Id}/revised.png`], note: 'Revised work' });

    // Client disputes milestone
    const disputeRes = await request(app)
      .post(`/api/milestones/${m2Id}/dispute`)
      .set('Authorization', clientToken)
      .send({ reason: 'Work quality does not match specification.' });

    expect(disputeRes.status).toBe(200);
    expect(disputeRes.body.status).toBe('DISPUTED');

    // Admin resolves dispute with RELEASE
    const resolveRes = await request(app)
      .post(`/api/milestones/${m2Id}/resolve-dispute`)
      .set('Authorization', adminToken)
      .send({ action: 'RELEASE', notes: 'Administrative review found quality satisfactory.' });

    expect(resolveRes.status).toBe(200);
    expect(resolveRes.body.disputeStatus).toBe('RESOLVED');
    expect(resolveRes.body.milestoneStatus).toBe('PAID_OUT');
  });

  test('POST /api/projects/:id/invoice generates PayPal invoice', async () => {
    const res = await request(app)
      .post(`/api/projects/${projectId}/invoice`)
      .set('Authorization', clientToken);

    expect(res.status).toBe(200);
    expect(res.body.invoiceId).toBeDefined();
    expect(res.body.status).toBe('SENT');
  });

  test('POST /api/webhooks/paypal verifies and processes webhook event', async () => {
    const payload = JSON.stringify({
      id: 'WH-TEST-INTEG-001',
      event_type: 'PAYMENT.CAPTURE.COMPLETED',
      resource: {
        id: 'CAP-WEBHOOK-01',
        invoice_id: milestoneId,
      },
    });

    const res = await request(app)
      .post('/api/webhooks/paypal')
      .set('Content-Type', 'application/json')
      .set('paypal-transmission-id', 'trans-test-1')
      .set('paypal-transmission-time', new Date().toISOString())
      .set('paypal-cert-url', 'https://api.sandbox.paypal.com/cert')
      .set('paypal-auth-algo', 'SHA256withRSA')
      .set('paypal-transmission-sig', 'test-sig')
      .send(payload);

    expect(res.status).toBe(200);

    // Duplicate submission should be ignored gracefully
    const dupRes = await request(app)
      .post('/api/webhooks/paypal')
      .set('Content-Type', 'application/json')
      .send(payload);
    expect(dupRes.status).toBe(200);
    expect(dupRes.body.status).toBe('DUPLICATE_IGNORED');
  });
});
