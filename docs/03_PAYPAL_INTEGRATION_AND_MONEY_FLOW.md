# PayPal Integration & Money Flow Architecture
## EscrowMind: AI Freelance Escrow Agent
**Technical Documentation v1.1 | PayPal AI Hackathon 2026**

---

## 1. Why `intent: AUTHORIZE` is the Native Escrow Pattern

Traditional payment gateways rely on immediate capture (`intent: CAPTURE`), where the buyer's payment instrument is immediately debited, and funds enter the merchant's account. This fails for freelance escrow:
1. **Unilateral Client Risk:** Once captured, returning funds requires a refund, which may incur transaction fee penalties and dispute friction.
2. **Regulatory & Custodial Overhead:** Holding unearned customer cash indefinitely in an operating balance can trigger heavy custodial banking regulations.

With PayPal's `intent: AUTHORIZE`:
- Funds are **reserved on the client's funding source** (credit card, bank account, or PayPal balance) without an immediate debit.
- Neither the platform nor the freelancer touches the money upfront.
- Funds are drawn programmatically in **partial captures** only as verified work is completed.
- If a project is cancelled or a dispute is upheld prior to delivery, the remaining authorization is simply **voided**, returning the hold to the client with zero refund fees.

---

## 2. Authorization Lifecycle: The 3-Day vs 29-Day Reality

A critical failure point in standard PayPal implementations is assuming a 29-day authorization guarantees funds for 29 days.

| Period | Duration | Guarantee Level | Required Action |
|---|---|---|---|
| **Honor Period** | Day 0 to Day 3 | 100% Guaranteed | Direct partial captures execute unconditionally. |
| **Validity Window** | Day 4 to Day 29 | Funds Reserved, Not Guaranteed | Must invoke `reauthorize` before capturing; can fail if client card expires or bank cancels hold. |
| **Expiration** | Day 30+ | Authorization Voided | No further captures possible; requires new order authorization. |

### The Reauthorization Lifecycle Job
EscrowMind includes an automated scheduled cron job (`scripts/reauthorizeJob.ts`) that runs daily:
1. Queries all projects with status `AUTHORIZED` or `IN_PROGRESS`.
2. Inspects `authorized_at` and `last_reauthorized_at`.
3. If project is $\ge 3$ days old and has uncaptured balance:
   - Calls `POST /v2/payments/authorizations/{authId}/reauthorize`.
   - Records new `authorizationId` and appends a `REAUTHORIZE` entry to `money_ledger`.
4. At Day 18 (2 days before `MAX_PROJECT_DAYS = 20`), warns client and freelancer.
5. If reauthorization fails, flips status to `AWAITING_REAUTHORIZATION` and freezes further milestone submissions until client updates payment.

---

## 3. Multi-Capture Mechanics: Partial Captures & Final Capture

PayPal allows multiple partial captures against a single authorization ID, subject to the rule:

$$\sum \text{Partial Captures} \le \text{Authorized Amount}$$

### 3.1 The `final_capture` Flag
When calling `POST /v2/payments/authorizations/{authId}/capture`:
```json
{
  "amount": { "currency_code": "USD", "value": "50.00" },
  "final_capture": false,
  "invoice_id": "milestone-uuid-1",
  "note_to_payer": "EscrowMind milestone 1 release"
}
```

- **Intermediate Milestones:** `final_capture: false`. The authorization remains active, holding the remaining balance.
- **Final Milestone:** `final_capture: true`. PayPal captures the final milestone amount and **automatically voids and releases any remaining held funds** back to the buyer's card.

### 3.2 Residual Calculation in Code
```typescript
const remaining = Number(project.total_amount) - Number(project.captured_total);
const isFinal = Math.abs(remaining - Number(milestone.amount)) < 0.005;

const captureResult = await capturePartial(
  project.paypal_authorization_id,
  milestone.id,
  milestone.amount.toFixed(2),
  isFinal
);
```

---

## 4. Freelancer Disbursements via PayPal Payouts

Captured funds land in the platform's merchant PayPal balance. To ensure low fees and instant settlements, EscrowMind uses the **PayPal Payouts REST API (`/v1/payments/payouts`)**.

### Payout Execution Architecture
```
[PayPal Client] ---> [Hold: Authorization] 
                             |
                   (Partial Capture: $50)
                             |
                             v
           [EscrowMind Merchant PayPal Balance]
                             |
                     (Payout API: $50)
                             |
                             v
               [Freelancer PayPal Account]
```

```typescript
export const sendPayout = (milestoneId: string, email: string, amount: string) =>
  pp('/v1/payments/payouts', 'POST', {
    sender_batch_header: {
      sender_batch_id: `batch-${milestoneId}`,
      email_subject: 'EscrowMind: Milestone payment released!',
    },
    items: [{
      recipient_type: 'EMAIL',
      receiver: email,
      amount: { value: amount, currency: 'USD' },
      sender_item_id: `item-${milestoneId}`,
      note: 'EscrowMind milestone verification payout',
    }],
  });
```

### Sandbox Balancing Requirement
Because Payouts draw from the merchant balance, the Platform Sandbox Business Account (`merchant@escrowmind.com`) must have funds deposited in the PayPal Developer Dashboard prior to running live payout tests.

---

## 5. Webhook Verification & Event Deduplication

Webhooks serve as the authoritative truth for asynchronous financial updates.

### 5.1 Raw Body Signature Verification
PayPal webhook verification requires the exact, unparsed request payload bytes. Express must use `express.raw({ type: '*/*' })`:

```typescript
export async function verifyWebhook(headers: Record<string, string>, rawBody: string) {
  const r = await pp('/v1/notifications/verify-webhook-signature', 'POST', {
    auth_algo: headers['paypal-auth-algo'],
    cert_url: headers['paypal-cert-url'],
    transmission_id: headers['paypal-transmission-id'],
    transmission_sig: headers['paypal-transmission-sig'],
    transmission_time: headers['paypal-transmission-time'],
    webhook_id: process.env.PAYPAL_WEBHOOK_ID,
    webhook_event: JSON.parse(rawBody),
  });
  return r.verification_status === 'SUCCESS';
}
```

### 5.2 Event Deduplication
All received events are inserted into the `paypal_events` table with `event_id` as the primary key. If a duplicate event arrives from PayPal's retry engine, the database rejects the insert, and the webhook immediately responds with `HTTP 200 OK` without re-executing business logic.

---

## 6. End-to-End Idempotency Matrix

| Operation | Idempotency Header | Scope / Format | Protection Mechanism |
|---|---|---|---|
| **Create Order** | `PayPal-Request-Id` | `order-<projectId>` | Prevents duplicate order creation if user double-clicks. |
| **Authorize Order** | `PayPal-Request-Id` | `auth-<orderId>` | Prevents concurrent authorize attempts on the same order. |
| **Capture Partial** | `PayPal-Request-Id` | `cap-<milestoneId>` | Prevents double-charging the client authorization. |
| **Payout Item** | `sender_batch_id` | `batch-<milestoneId>` | PayPal natively rejects identical batch IDs if already submitted. |
| **State Guard** | DB WHERE Clause | `WHERE status = 'VERIFIED'` | Guarantees atomic milestone state transition; 0 rows updated on race condition. |
