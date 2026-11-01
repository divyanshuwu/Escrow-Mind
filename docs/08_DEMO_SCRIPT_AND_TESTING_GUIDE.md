# 3-Minute Demo Script & Sandbox Testing Guide
## EscrowMind: AI Freelance Escrow Agent
**Technical Documentation v1.1 | PayPal AI Hackathon 2026**

---

## 1. 3-Minute Video / Live Demo Script

| Time | Screen / Visual | Narration / Action | Technical Event Under the Hood |
|---|---|---|---|
| **0:00 - 0:25** | Client Dashboard: Natural language input box. | *"Meet EscrowMind. Today, clients fear paying upfront, and freelancers fear not getting paid. Watch how an AI agent solves this."*<br>Type: `"Logo design, brand guide and social banners, 3 days, $200"`. Click **Generate Contract**. | `POST /api/projects/parse`<br>GPT-4o parses brief into 3 milestones ($50, $70, $80). |
| **0:25 - 0:45** | AG Grid Milestone Editor. | *"The Contract Agent structures 3 milestones with clear deliverables. Using AG Grid, the client edits Milestone 1 from $50 to $60, and the grid instantly recalculates remaining funds."* | AG Grid cell validator maintains $\sum M_i = \$200$. Invariant validated. |
| **0:45 - 1:10** | PayPal Approval Popup. | *"The client clicks 'Authorize Escrow'. The PayPal popup appears. Money is reserved—NOT charged. Zero upfront risk."*<br>Client signs into Sandbox Personal Account and clicks **Authorize**. | `POST /v2/checkout/orders` (`AUTHORIZE`) $\rightarrow$ `POST /v2/checkout/orders/{id}/authorize`. Auth ID displayed on UI. |
| **1:10 - 1:40** | Freelancer Workspace: Milestone 1 File Upload. | *"Over in the Freelancer Workspace, the $200 guarantee is live. The freelancer uploads `logo_concepts.png` and submits."*<br>Show the live verification pipeline indicator. | `POST /milestones/:id/submit` $\rightarrow$ Async Workflow triggered $\rightarrow$ GPT-4o Vision audits files $\rightarrow$ KERNEL audits portfolio. |
| **1:40 - 2:05** | Real-time Approval & PayPal Payout. | *"In 12 seconds, the Verifier Agent scores it an 88. Because it's over 80, the AI autonomously executes a $60 partial capture and releases a PayPal Payout to the freelancer!"* | `POST /v2/payments/authorizations/{id}/capture` ($60, `final_capture: false`) $\rightarrow$ `POST /v1/payments/payouts` ($60). |
| **2:05 - 2:30** | Milestone 2 Submission: Client Review Flow. | *"For Milestone 2, the freelancer uploads a draft with a minor issue. The AI scores it 68—between 50 and 80. The AI escalates to the client for human sign-off."*<br>Client clicks **Approve**. | Status flips to `NEEDS_CLIENT_REVIEW` $\rightarrow$ `POST /milestones/:id/review` $\rightarrow$ Captures $70. |
| **2:30 - 2:50** | Milestone 3 Final Delivery & Residual Void. | *"The freelancer uploads final vector source files. Verified! The final capture executes with `final_capture: true`, closing the authorization cleanly."* | `POST .../capture` ($70, `final_capture: true`) $\rightarrow$ Authorization closed cleanly. |
| **2:50 - 3:00** | AG Grid Ledger & Sandbox Balances. | *"Look at our transaction ledger: every dollar, partial capture, and payout is traced by its PayPal ID. EscrowMind brings autonomous trust to agentic commerce."* | Display append-only `money_ledger` on AG Grid. Show freelancer sandbox balance: `+$200.00`. |

---

## 2. Sandbox Test Suite: 15 Verified Test Scenarios

| # | Test Scenario | Execution Trigger | Expected System Behavior & Validation |
|---|---|---|---|
| **1** | Order Creation & Approval | Client creates project & approves PayPal popup | `order.status == 'APPROVED'`, `authorize` returns `authorization_id`, project status `AUTHORIZED`. |
| **2** | Intermediate Partial Capture | Milestone 1 verification approved | `/capture` returns `COMPLETED`, `final_capture: false`, authorization remains active with remaining balance. |
| **3** | Subsequent & Final Capture | Final milestone verification approved | `/capture` returns `COMPLETED`, `final_capture: true`, authorization closed; remainder voided. |
| **4** | Capture Idempotency Test | Re-send identical capture request | Same PayPal Capture ID returned, no duplicate debit; zero ledger duplication. |
| **5** | Automated Freelancer Payout | Payout executed upon capture | PayPal Payouts returns `batch_status: SUCCESS`, freelancer sandbox account balance incremented. |
| **6** | Over-Capture Defense | Attempt capture exceeding uncaptured balance | PayPal returns `CAPTURE_LIMIT_EXCEEDED`, API responds `400 INVALID_AMOUNT`. |
| **7** | Client Cancellation Prior to Work | Client cancels active project | Calls `voidAuthorization()`, PayPal hold released, buyer account reflects zero charges. |
| **8** | Reauthorization Lifecycle Check | Run reauthorization cron after 3 days | `reauthorize()` executes, new `authorization_id` recorded, `last_reauthorized_at` updated. |
| **9** | Webhook Deduplication | Submit identical webhook event payload twice | Database drops duplicate via PK constraint on `event_id`, API immediately returns `200 OK`. |
| **10**| AI Score $\ge 80$ (Auto-Approval) | High-quality files matching rubric uploaded | Workflow calculates score $\ge 80$, autonomously invokes capture and payout. |
| **11**| AI Score $50 - 79$ (Client Review) | Incomplete files or draft uploaded | Milestone status transitions to `NEEDS_CLIENT_REVIEW`, capture delayed until client clicks Approve. |
| **12**| AI Score $< 50$ (Auto-Rejection) | Irrelevant or corrupt files uploaded | Milestone status marked `REJECTED`, actionable feedback returned to freelancer, zero funds released. |
| **13**| Prompt Injection Resistance | File containing adversarial prompt injection | Scanner flags injection, hard-caps score at `49`, auto-rejects submission. |
| **14**| KERNEL Fallback Resilience | Portfolio check times out or network disabled | Verifier Agent smoothly falls back to vision-only formula without pipeline failure. |
| **15**| High-Value Milestone Safety Guard | Milestone amount exceeds $500 | Even with score 95, system blocks auto-capture and forces manual client sign-off. |

---

## 3. Quick Sandbox Smoke Test (cURL Commands)

### Step 1: Retrieve PayPal OAuth Bearer Token
```bash
TOKEN=$(curl -s -u "$PAYPAL_CLIENT_ID:$PAYPAL_CLIENT_SECRET" \
  -d "grant_type=client_credentials" \
  https://api-m.sandbox.paypal.com/v1/oauth2/token | jq -r .access_token)
echo "Token: $TOKEN"
```

### Step 2: Create Intent: AUTHORIZE Order
```bash
curl -s -X POST https://api-m.sandbox.paypal.com/v2/checkout/orders \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "intent": "AUTHORIZE",
    "purchase_units": [{
      "amount": { "currency_code": "USD", "value": "200.00" },
      "description": "EscrowMind test project escrow"
    }]
  }' | jq .
```

### Step 3: Test Idempotent Partial Capture
```bash
curl -s -X POST https://api-m.sandbox.paypal.com/v2/payments/authorizations/$AUTH_ID/capture \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -H "PayPal-Request-Id: cap-milestone-01" \
  -d '{
    "amount": { "currency_code": "USD", "value": "50.00" },
    "final_capture": false,
    "note_to_payer": "EscrowMind milestone 1 release"
  }' | jq .
```

---

## 4. Troubleshooting & Sandbox FAQ

| Issue | Root Cause | Solution |
|---|---|---|
| **Payouts fail with `INSUFFICIENT_FUNDS`** | Merchant sandbox account has $0 balance | Go to Developer Dashboard $\rightarrow$ Sandbox Accounts $\rightarrow$ Select Business account $\rightarrow$ Funding $\rightarrow$ Add $1,000 balance. |
| **Capture returns `AUTHORIZATION_EXPIRED`** | 29-day window lapsed or test authorization aged | Re-run order creation and authorization flow to generate a fresh `authId`. |
| **Webhook fails verification in local dev** | ngrok tunnel mismatch or simulator headers | Set `DEV_SKIP_VERIFY=true` in local `.env` to bypass cryptographic check during offline testing. |
| **KERNEL portfolio check times out** | Freelancer profile domain throttled | Enable `MOCK_KERNEL=true` to simulate portfolio trust response in sub-second time. |
