const BASE = process.env.PAYPAL_BASE_URL || 'https://api-m.sandbox.paypal.com';
let cachedToken: { token: string; exp: number } | null = null;

export async function getAccessToken(): Promise<string> {
  // If no credentials supplied or mock mode, return mock token
  if (!process.env.PAYPAL_CLIENT_ID || process.env.PAYPAL_CLIENT_ID === 'your_paypal_sandbox_client_id_here') {
    return 'mock-sandbox-token-xyz';
  }

  if (cachedToken && cachedToken.exp > Date.now() + 60_000) {
    return cachedToken.token;
  }

  const basic = Buffer.from(
    `${process.env.PAYPAL_CLIENT_ID}:${process.env.PAYPAL_CLIENT_SECRET}`
  ).toString('base64');

  const res = await fetch(`${BASE}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basic}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });

  if (!res.ok) {
    throw new Error(`PayPal auth failed with status: ${res.status}`);
  }

  const data = (await res.json()) as { access_token: string; expires_in: number };
  cachedToken = {
    token: data.access_token,
    exp: Date.now() + data.expires_in * 1000,
  };
  return cachedToken.token;
}

export async function pp(
  path: string,
  method: string,
  body?: unknown,
  requestId?: string
): Promise<any> {
  // If sandbox credentials not configured, provide mock responses for local unit testing
  if (!process.env.PAYPAL_CLIENT_ID || process.env.PAYPAL_CLIENT_ID.startsWith('your_')) {
    return mockPayPalResponse(path, method, body, requestId);
  }

  const token = await getAccessToken();
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
    Prefer: 'return=representation',
  };

  if (requestId) {
    headers['PayPal-Request-Id'] = requestId;
  }

  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  const data: any = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err: any = new Error(data?.message || `PayPal error HTTP ${res.status}`);
    err.status = res.status;
    err.debugId = data?.debug_id;
    err.details = data?.details;
    throw err;
  }
  return data;
}

export const createAuthorizeOrder = async (projectId: string, amount: string) => {
  return pp(
    '/v2/checkout/orders',
    'POST',
    {
      intent: 'AUTHORIZE',
      purchase_units: [
        {
          reference_id: projectId,
          custom_id: projectId,
          description: 'EscrowMind project escrow hold',
          amount: { currency_code: 'USD', value: amount },
        },
      ],
      payment_source: {
        paypal: {
          experience_context: {
            return_url: `${process.env.APP_URL || 'http://localhost:8080'}/paypal/return`,
            cancel_url: `${process.env.APP_URL || 'http://localhost:8080'}/paypal/cancel`,
            user_action: 'CONTINUE',
          },
        },
      },
    },
    `order-${projectId}`
  );
};

export const authorizeOrder = async (orderId: string) => {
  return pp(`/v2/checkout/orders/${orderId}/authorize`, 'POST', {}, `auth-${orderId}`);
};

export const capturePartial = async (
  authId: string,
  milestoneId: string,
  amount: string,
  isFinal: boolean
) => {
  return pp(
    `/v2/payments/authorizations/${authId}/capture`,
    'POST',
    {
      amount: { currency_code: 'USD', value: amount },
      final_capture: isFinal,
      invoice_id: milestoneId,
      note_to_payer: 'EscrowMind milestone release',
    },
    `cap-${milestoneId}`
  );
};

export const reauthorize = async (authId: string, amount: string) => {
  return pp(
    `/v2/payments/authorizations/${authId}/reauthorize`,
    'POST',
    { amount: { currency_code: 'USD', value: amount } },
    `reauth-${authId}-${Date.now()}`
  );
};

export const voidAuthorization = async (authId: string) => {
  return pp(`/v2/payments/authorizations/${authId}/void`, 'POST', undefined, `void-${authId}`);
};

export const refundCapture = async (captureId: string, amount?: string) => {
  return pp(
    `/v2/payments/captures/${captureId}/refund`,
    'POST',
    amount ? { amount: { currency_code: 'USD', value: amount } } : {},
    `refund-${captureId}-${Date.now()}`
  );
};

export const sendPayout = async (milestoneId: string, email: string, amount: string) => {
  return pp('/v1/payments/payouts', 'POST', {
    sender_batch_header: {
      sender_batch_id: `batch-${milestoneId}`,
      email_subject: 'You received a milestone payment via EscrowMind',
    },
    items: [
      {
        recipient_type: 'EMAIL',
        receiver: email,
        amount: { value: amount, currency: 'USD' },
        sender_item_id: `item-${milestoneId}`,
        note: 'EscrowMind milestone payout',
      },
    ],
  });
};

export const getPayoutBatch = async (batchId: string) => {
  return pp(`/v1/payments/payouts/${batchId}`, 'GET');
};

export async function verifyWebhook(
  headers: Record<string, string | undefined>,
  rawBody: string
): Promise<boolean> {
  if (process.env.DEV_SKIP_VERIFY === 'true') {
    return true; // Bypass signature verification in local development
  }

  try {
    const r = await pp('/v1/notifications/verify-webhook-signature', 'POST', {
      auth_algo: headers['paypal-auth-algo'],
      cert_url: headers['paypal-cert-url'],
      transmission_id: headers['paypal-transmission-id'],
      transmission_sig: headers['paypal-transmission-sig'],
      transmission_time: headers['paypal-transmission-time'],
      webhook_id: process.env.PAYPAL_WEBHOOK_ID || 'mock-webhook-id',
      webhook_event: JSON.parse(rawBody),
    });
    return r.verification_status === 'SUCCESS';
  } catch (e) {
    if (process.env.DEV_SKIP_VERIFY === 'true') return true;
    return false;
  }
}

// In-memory mock response engine for zero-dependency local testing
function mockPayPalResponse(path: string, method: string, body?: any, requestId?: string): any {
  if (path === '/v2/checkout/orders') {
    return {
      id: `ORDER-${Date.now().toString(36).toUpperCase()}`,
      status: 'CREATED',
      intent: 'AUTHORIZE',
      links: [{ href: 'https://sandbox.paypal.com/checkoutnow', rel: 'approve' }],
    };
  }
  if (path.includes('/authorize')) {
    return {
      id: `AUTH-${Date.now().toString(36).toUpperCase()}`,
      status: 'CREATED',
      purchase_units: [
        {
          payments: {
            authorizations: [
              {
                id: `AUTH-${Date.now().toString(36).toUpperCase()}`,
                status: 'CREATED',
                expiration_time: new Date(Date.now() + 29 * 86400000).toISOString(),
              },
            ],
          },
        },
      ],
    };
  }
  if (path.includes('/capture')) {
    return {
      id: `CAP-${Date.now().toString(36).toUpperCase()}`,
      status: 'COMPLETED',
      amount: body?.amount || { currency_code: 'USD', value: '50.00' },
      final_capture: body?.final_capture || false,
    };
  }
  if (path.includes('/reauthorize')) {
    return {
      id: `AUTH-RENEW-${Date.now().toString(36).toUpperCase()}`,
      status: 'CREATED',
      expiration_time: new Date(Date.now() + 29 * 86400000).toISOString(),
    };
  }
  if (path.includes('/void')) {
    return { status: 'VOIDED' };
  }
  if (path.includes('/refund')) {
    return {
      id: `REFUND-${Date.now().toString(36).toUpperCase()}`,
      status: 'COMPLETED',
    };
  }
  if (path === '/v1/payments/payouts') {
    return {
      batch_header: {
        payout_batch_id: `BATCH-${Date.now().toString(36).toUpperCase()}`,
        batch_status: 'SUCCESS',
      },
    };
  }
  if (path.includes('/notifications/verify-webhook-signature')) {
    return { verification_status: 'SUCCESS' };
  }
  return { status: 'SUCCESS' };
}
