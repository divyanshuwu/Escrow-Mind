# Database Schema & Ledger Architecture
## EscrowMind: AI Freelance Escrow Agent
**Technical Documentation v1.1 | PayPal AI Hackathon 2026**

---

## 1. Relational Data Architecture

The EscrowMind data layer is built on PostgreSQL (via Supabase), using strict custom ENUMs, relational integrity constraints, atomic check constraints, and an immutable append-only financial ledger.

```
+--------------------+        +--------------------+
|       users        |        |      projects      |
|--------------------|        |--------------------|
| id (PK)            |<-------| id (PK)            |
| email              | 1    N | client_id (FK)     |
| paypal_email       |<-------| freelancer_id (FK) |
| role               | 1    N | total_amount       |
| portfolio_url      |        | captured_total     |
+--------------------+        | status             |
                              +---------+----------+
                                        | 1
                                        | N
                              +---------v----------+        +--------------------+
                              |     milestones     |        |      disputes      |
                              |--------------------|        |--------------------|
                              | id (PK)            |<-------| id (PK)            |
                              | project_id (FK)    | 1    N | milestone_id (FK)  |
                              | seq                |        | client_id (FK)     |
                              | title              |        | reason             |
                              | amount             |        | evidence_packet    |
                              | status             |        | status             |
                              +---------+----------+        +--------------------+
                                        | 1
                                        | N
                              +---------v----------+
                              |    submissions     |
                              |--------------------|
                              | id (PK)            |
                              | milestone_id (FK)  |
                              | file_urls          |
                              | ai_score           |
                              | ai_report_json     |
                              | decision           |
                              +--------------------+

+--------------------------------------------------------------------------------+
|                        money_ledger (Append-Only Audit)                        |
|--------------------------------------------------------------------------------|
| id (BigSerial PK) | project_id (FK) | milestone_id (FK) | kind | amount |       |
| paypal_id         | fee_amount      | created_at                               |
+--------------------------------------------------------------------------------+
```

---

## 2. Table Data Dictionary

### 2.1 `users`
Stores registered participants with their authenticated roles and payment credentials.
- `id` (`UUID`, PK): Supabase Auth UID.
- `email` (`TEXT`, Unique, Not Null): Primary notification email.
- `paypal_email` (`TEXT`): PayPal account email for payouts.
- `role` (`user_role`, Not Null): `'client'` or `'freelancer'`.
- `portfolio_url` (`TEXT`): Public portfolio URL (GitHub, Behance, Dribbble) for verification.

### 2.2 `projects`
Stores high-level contract metadata, authorization status, and totals.
- `id` (`UUID`, PK): Unique project identifier.
- `client_id` (`UUID`, FK $\rightarrow$ `users.id`): Creator/payer.
- `freelancer_id` (`UUID`, FK $\rightarrow$ `users.id`): Assigned receiver.
- `raw_prompt` (`TEXT`, Not Null): Original natural-language input.
- `total_amount` (`NUMERIC(10,2)`, Check: $5 \le \text{total} \le 10000$).
- `currency` (`CHAR(3)`, Default: `'USD'`).
- `paypal_order_id` (`TEXT`): PayPal Order ID from order creation.
- `paypal_authorization_id` (`TEXT`): PayPal Authorization ID.
- `authorized_at` (`TIMESTAMPTZ`): Timestamp when authorization completed.
- `authorization_expires_at` (`TIMESTAMPTZ`): Authorization expiration deadline.
- `last_reauthorized_at` (`TIMESTAMPTZ`): Last reauthorization execution.
- `captured_total` (`NUMERIC(10,2)`, Default: `0.00`).
- `status` (`project_status`, Default: `'DRAFT'`).

### 2.3 `milestones`
Sequential delivery steps comprising the project contract.
- `id` (`UUID`, PK): Unique milestone identifier.
- `project_id` (`UUID`, FK $\rightarrow$ `projects.id` ON DELETE CASCADE).
- `seq` (`INT`, Not Null): 1-indexed order (`1`, `2`, `3`).
- `title` (`TEXT`, Not Null): Milestone headline.
- `description` (`TEXT`): Scope description.
- `deliverables` (`JSONB`, Default: `'[]'`): Array of expected items and counts.
- `amount` (`NUMERIC(10,2)`, Check: $\text{amount} > 0$).
- `deadline` (`TIMESTAMPTZ`): Due date.
- `status` (`milestone_status`, Default: `'PENDING'`).

### 2.4 `submissions`
Work deliverables uploaded by the freelancer for evaluation.
- `id` (`UUID`, PK): Submission identifier.
- `milestone_id` (`UUID`, FK $\rightarrow$ `milestones.id` ON DELETE CASCADE).
- `file_urls` (`TEXT[]`, Not Null): Supabase Storage file paths.
- `note` (`TEXT`): Freelancer context notes.
- `ai_verification_score` (`INT`, Check: $0 \le \text{score} \le 100$).
- `ai_report_json` (`JSONB`): Comprehensive Verifier Agent report and rubric breakdown.
- `decision` (`TEXT`): `'AUTO_APPROVED'`, `'NEEDS_REVIEW'`, `'AUTO_REJECTED'`, `'CLIENT_APPROVED'`, `'CLIENT_REJECTED'`.
- `paypal_capture_id` (`TEXT`): Capture transaction ID upon approval.
- `paypal_payout_batch_id` (`TEXT`): Payout batch identifier.

### 2.5 `money_ledger` (Append-Only)
Immutable double-entry audit trail tracking all monetary movements.
- `id` (`BIGSERIAL`, PK): Sequence ID.
- `project_id` (`UUID`, FK $\rightarrow$ `projects.id`).
- `milestone_id` (`UUID`, FK $\rightarrow$ `milestones.id`, Nullable).
- `kind` (`TEXT`, Not Null): `'AUTHORIZE'`, `'CAPTURE'`, `'PAYOUT'`, `'FEE'`, `'VOID'`, `'REFUND'`, `'REAUTHORIZE'`.
- `amount` (`NUMERIC(10,2)`, Not Null).
- `paypal_id` (`TEXT`, Not Null): Associated PayPal Transaction, Authorization, or Batch ID.
- `created_at` (`TIMESTAMPTZ`, Default: `now()`).

### 2.6 `disputes`
Formal escrow freezes requiring administrative intervention.
- `id` (`UUID`, PK): Dispute identifier.
- `milestone_id` (`UUID`, FK $\rightarrow$ `milestones.id`).
- `client_id` (`UUID`, FK $\rightarrow$ `users.id`).
- `reason` (`TEXT`, Not Null): Client justification.
- `evidence_packet` (`JSONB`): Auto-assembled context package.
- `status` (`dispute_status`, Default: `'OPEN'`). Resolves to `'REFUNDED'` or `'RELEASED'`.

---

## 3. State Machines

### 3.1 Project State Transitions
```
[DRAFT] ---> [AWAITING_APPROVAL] ---> [AUTHORIZED] ---> [IN_PROGRESS] ---> [COMPLETED]
                     |                      |                   |
                     v                      v                   v
                [CANCELLED]            [CANCELLED]          [EXPIRED]
```

| From | To | Trigger / Guard |
|---|---|---|
| `DRAFT` | `AWAITING_APPROVAL` | Client confirms milestone breakdown (`POST /projects`). |
| `AWAITING_APPROVAL` | `AUTHORIZED` | Buyer approves hold; server executes `authorizeOrder()`. |
| `AUTHORIZED` | `IN_PROGRESS` | Freelancer assigned and Milestone 1 submission initiated. |
| `IN_PROGRESS` | `COMPLETED` | Final milestone captured and paid out (`captured_total == total_amount`). |
| Any | `CANCELLED` | Client cancels before capture; remaining hold voided. |
| `AUTHORIZED` | `EXPIRED` | Authorization lapses past 29 days without completion. |

### 3.2 Milestone State Transitions
```
[PENDING] ---> [SUBMITTED] ---> [VERIFYING]
                                     |
               +---------------------+---------------------+
               |                     |                     |
        (Score >= 80)          (50 <= Score < 80)     (Score < 50)
               v                     v                     v
          [VERIFIED]      [NEEDS_CLIENT_REVIEW]       [REJECTED]
               |                     |                     |
               |             +-------+-------+             |
               |             |               |             |
               |        (Approved)      (Rejected)         |
               +---------->  |               +-------------+
                             v                             v
                        [CAPTURED]                    [PENDING]
                             |                       (Resubmission)
                             v
                         [PAID_OUT]
```

---

## 4. Database Invariants & Integrity Constraints

1. **Sum Matching Invariant:**
   $$\sum_{m \in \text{Milestones}} m.\text{amount} = \text{project}.\text{total\_amount}$$
   Enforced in API application logic and validated via SQL triggers before transitions out of `DRAFT`.

2. **Immutable Ledger Guard:**
   `money_ledger` has strict PostgreSQL table permissions prohibiting `UPDATE` and `DELETE` operations. All corrections are modeled as compensatory ledger entries (`REFUND`, `VOID`).

3. **Sequential Submission Rule:**
   A milestone can only transition from `PENDING` to `SUBMITTED` if all prior milestones (`seq < current.seq`) have attained status `VERIFIED`, `CAPTURED`, or `PAID_OUT`.
