# Internal API Specification
## EscrowMind: AI Freelance Escrow Agent
**Technical Documentation v1.1 | PayPal AI Hackathon 2026**

---

## 1. Global Standards & Authentication

- **Base URL:** `https://<backend-domain>/api` (Local dev: `http://localhost:8080/api`)
- **Headers:**
  - `Content-Type: application/json`
  - `Authorization: Bearer <supabase-jwt>` (All endpoints except webhooks)
- **Standard Success Format:** `200 OK` or `201 Created` with JSON payload.
- **Standard Error Format:**
```json
{
  "error": {
    "code": "CONTRACT_SUM_MISMATCH",
    "message": "Milestone amounts ($190.00) must equal project total ($200.00)",
    "details": {}
  }
}
```

---

## 2. Endpoint Index

| Method | Endpoint | Allowed Role | Description |
|---|---|---|---|
| `POST` | `/projects/parse` | Client | AI parsing of raw project brief into structured milestones |
| `POST` | `/projects` | Client | Creates project and persists confirmed contract |
| `GET` | `/projects` | Both | Lists projects relevant to authenticated user |
| `GET` | `/projects/:id` | Both | Retrieves full project details, milestones, and timeline |
| `PATCH`| `/projects/:id/milestones` | Client | Edits milestone titles, amounts, and dates prior to authorization |
| `POST` | `/projects/:id/assign` | Client | Assigns freelancer by email address |
| `POST` | `/paypal/orders` | Client | Creates PayPal order with `intent: AUTHORIZE` |
| `POST` | `/paypal/authorize` | Client | Captures approval and authorizes hold on payment source |
| `POST` | `/projects/:id/cancel` | Client | Cancels project and voids PayPal authorization |
| `GET` | `/milestones/:id` | Both | Detailed milestone status, rubric, and submissions |
| `POST` | `/milestones/:id/upload-url` | Freelancer | Generates HMAC-signed Supabase upload URL |
| `POST` | `/milestones/:id/submit` | Freelancer | Submits deliverables and triggers async verification pipeline |
| `POST` | `/milestones/:id/review` | Client | Manual client approval or rejection (score 50–79) |
| `POST` | `/milestones/:id/dispute` | Client | Freezes milestone and escalates to dispute arbitration |
| `POST` | `/milestones/:id/resolve-dispute` | Admin | Resolves dispute with refund or release override |
| `POST` | `/workflows/verify` | Internal | Callback from Render Workflow or local runner |
| `POST` | `/webhooks/paypal` | PayPal | Webhook event receiver with signature validation |
| `POST` | `/projects/:id/invoice` | Client | Issues and sends PayPal Invoice for completed work |
| `GET` | `/projects/:id/ledger` | Both | Retrieves immutable financial ledger for timeline and AG Grid |

---

## 3. Detailed Endpoint Schemas

### 3.1 `POST /projects/parse`
Parses unstructured natural language into structured milestones using GPT-4o.
- **Request:**
```json
{
  "prompt": "Need a modern SaaS logo, brand guide and 3 social banners in 5 days for $200"
}
```
- **Response `200 OK`:**
```json
{
  "total_amount": 200,
  "currency": "USD",
  "deadline_days": 5,
  "deliverable_type": "graphic_design",
  "milestones": [
    {
      "seq": 1,
      "title": "Initial Concept Sketches",
      "description": "3 distinct logo directions in PNG format",
      "amount": 50.00,
      "deadline_days": 2,
      "deliverables": ["3x PNG concepts"]
    },
    {
      "seq": 2,
      "title": "Selected Logo Revisions & Brand Palette",
      "description": "Color codes, typography hierarchy, and logo refinement",
      "amount": 70.00,
      "deadline_days": 2,
      "deliverables": ["1x Style Guide PDF", "Refined Vector PNG"]
    },
    {
      "seq": 3,
      "title": "Final Assets & Social Banners",
      "description": "Source files (AI, SVG) plus 3 social banner templates",
      "amount": 80.00,
      "deadline_days": 1,
      "deliverables": ["Vector SVG", "AI Source File", "3x Banner PNGs"]
    }
  ]
}
```

---

### 3.2 `POST /paypal/orders`
Creates the PayPal AUTHORIZE order. Allowed only when project status is `AWAITING_APPROVAL`.
- **Request:**
```json
{ "projectId": "550e8400-e29b-41d4-a716-446655440000" }
```
- **Response `200 OK`:**
```json
{
  "orderId": "5O190127TN364715T"
}
```

---

### 3.3 `POST /paypal/authorize`
Called after client approves the PayPal popup on the frontend.
- **Request:**
```json
{
  "projectId": "550e8400-e29b-41d4-a716-446655440000",
  "orderId": "5O190127TN364715T"
}
```
- **Response `200 OK`:**
```json
{
  "authorizationId": "2GG279541U471931P",
  "status": "AUTHORIZED",
  "expiresAt": "2026-11-22T10:00:00Z"
}
```

---

### 3.4 `POST /milestones/:id/submit`
Submits uploaded files and triggers the asynchronous verification pipeline.
- **Request:**
```json
{
  "paths": ["submissions/m1/concept_1.png", "submissions/m1/concept_2.png"],
  "note": "Here are the 3 logo variations as requested."
}
```
- **Response `202 Accepted`:**
```json
{
  "submissionId": "771e8400-e29b-41d4-a716-446655440001",
  "status": "VERIFYING",
  "workflowRunId": "run_01j7x2k98a"
}
```

---

### 3.5 `POST /workflows/verify` (Internal Engine Route)
Protected by `X-Internal-Secret: <INTERNAL_WORKFLOW_SECRET>`. Receives telemetry from Render Workflows or local worker and executes programmatic capture & payout.
- **Request:**
```json
{
  "submissionId": "771e8400-e29b-41d4-a716-446655440001",
  "score": 88,
  "report": {
    "score": 88,
    "deliverables": [
      { "name": "3x PNG concepts", "found": true, "confidence": 0.94, "reason": "Three high-resolution logo concepts identified." }
    ],
    "portfolio": { "checked": true, "trust": 85, "notes": "Active GitHub profile with 12 design repositories." },
    "flags": [],
    "summary_for_client": "All deliverables verified with high confidence."
  }
}
```
- **Response `200 OK`:**
```json
{
  "decision": "AUTO_APPROVED",
  "status": "PAID_OUT",
  "captureId": "3RM92092UW6741414",
  "payoutBatchId": "FYXMPQTX4JC9N"
}
```

---

### 3.6 `POST /milestones/:id/resolve-dispute` (Admin Arbitration)
Admin overrides a contested milestone.
- **Request:**
```json
{
  "action": "RELEASE", // or "REFUND"
  "notes": "Work satisfies 90% of specifications after administrative review."
}
```
- **Response `200 OK`:**
```json
{
  "disputeStatus": "RESOLVED",
  "milestoneStatus": "PAID_OUT",
  "transactionId": "FYXMPQTX4JC9N"
}
```

---

## 4. Error Code Reference

| Status | Error Code | Description / Remedy |
|---|---|---|
| `400` | `INVALID_AMOUNT` | Project budget must be between $5.00 and $10,000.00 USD. |
| `400` | `PROMPT_INJECTION_DETECTED` | Adversarial injection pattern recognized; submission quarantined. |
| `401` | `UNAUTHENTICATED` | Bearer JWT missing or expired. |
| `403` | `FORBIDDEN` | User does not own the project or lacks requisite role. |
| `409` | `INVALID_STATE` | Operation illegal in current lifecycle state (e.g., submitting on a paid milestone). |
| `422` | `CONTRACT_SUM_MISMATCH` | Sum of milestone amounts does not equal project total. |
| `502` | `PAYPAL_API_ERROR` | Upstream PayPal error; includes PayPal `debug_id` in response. |
| `503` | `SERVICE_UNAVAILABLE` | AI or KERNEL agent timeout; fallback score utilized. |
