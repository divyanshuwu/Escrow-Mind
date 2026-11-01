# Product Requirements Document (PRD)
## EscrowMind: AI Freelance Escrow Agent
**Technical Documentation v1.1 | PayPal AI Hackathon 2026**  
**Track:** Agentic Commerce, Open Innovation

---

## 1. Executive Summary & Vision

Trust is the central friction point in global freelancing:
- **Clients** fear paying 100% upfront and receiving substandard or zero deliverables.
- **Freelancers** fear investing hours of labor only to be ghosted, forced into unpaid revisions, or scammed.
- **Legacy Marketplaces** charge exorbitant 15%–20% commission rates, lock funds arbitrarily, and resolve disputes through slow, manual, subjective support staff.

**EscrowMind** is an autonomous AI Escrow Agent that programmatically guarantees trust between clients and freelancers using PayPal's enterprise authorization-capture-payout rails and multimodal deliverable verification.

### Core Value Proposition
1. **Zero Upfront Transfer:** Client funds are authorized (reserved on their payment instrument), not immediately captured.
2. **Autonomous Objective Verification:** Deliverables are analyzed by GPT-4o Vision against contract requirements, while freelancer profiles are cross-checked by KERNEL browser agents.
3. **Instant Micro-Payouts:** Passing deliverables trigger partial captures and instant payouts via PayPal Payouts within seconds.
4. **Fractional Commission:** Eliminates 20% marketplace take rates, operating on a transparent 0%–3% platform fee model.
5. **100% On-Chain & PayPal Ledger Traceability:** Every financial transition is immutably logged with its PayPal Transaction ID.

---

## 2. User Personas & Core Journeys

### 2.1 The Client (Buyer)
- **Profile:** Startup founder or agency manager commissioning design, software, or copy.
- **Pain Point:** Lack of time to review iterative submissions; anxiety about unspent advance deposits.
- **Journey:**
  1. Types a natural language project brief (English, Hindi, or Hinglish).
  2. Reviews and edits AI-structured milestone breakdown on an interactive AG Grid.
  3. Approves PayPal Authorization with one click (funds reserved, zero immediate charge).
  4. Receives notifications only when deliverables require manual review (confidence 50%–80%) or on milestone completion.
  5. Can freeze funds with a dispute flag if work deviates from agreement.

### 2.2 The Freelancer (Seller)
- **Profile:** Independent creator or software developer.
- **Pain Point:** Non-paying clients, scope creep, payout delays.
- **Journey:**
  1. Receives project invitation and verified PayPal authorization guarantee.
  2. Submits files per milestone directly through the workspace.
  3. Watches real-time AI verification pipeline (under 20 seconds).
  4. Receives instant PayPal payout into their account upon milestone approval.
  5. If rejected (<50%), receives actionable, objective AI feedback for resubmission.

### 2.3 The Platform Admin / Arbitrator
- **Profile:** Fiduciary overseer for contested transactions.
- **Journey:**
  1. Accesses flagged disputes (`DISPUTED` status).
  2. Reviews AI Evidence Packet (combining project prompt, agreed deliverables, uploaded files, and vision telemetry).
  3. Executes one-click resolution (force milestone capture & payout OR void/refund capture to client).

---

## 3. Product Features & Functional Requirements

### 3.1 AI Contract Generation (Contract Agent)
- **Input:** Plain text prompt (e.g., *"Need a modern SaaS logo, brand guide and 3 social banners in 5 days for $300"*).
- **Processing:** GPT-4o parses scope into 2–5 sequential milestones.
- **Constraints:**
  - Milestone amounts must strictly sum to total budget.
  - Milestone 1 cannot exceed 50% of the total budget.
  - Final milestone must contain primary source deliverables (e.g., `.ai`, `.svg`, `.psd`, GitHub repo).
  - Maximum project timeline capped at 20 days (to guarantee completion inside PayPal's 29-day validity window).

### 3.2 Dynamic Contract Customization (AG Grid)
- Interactive client dashboard powered by AG Grid.
- Real-time cell editing of titles, deliverables, amounts, and deadlines.
- Live sum validator showing remaining budget allocation; prevents confirmation if $\sum \text{Milestones} \neq \text{Total}$.

### 3.3 PayPal Escrow Rails (Intent: AUTHORIZE)
- Direct integration with PayPal v2 Orders API.
- Buyer approves full project authorization in a secure PayPal popup.
- Server authorizes order and captures Authorization ID (`authId`).
- Supports automated daily reauthorization cron job for projects extending past the 3-day honor period.

### 3.4 Multimodal Verification Pipeline (Verifier Agent)
- **Async Execution:** Asynchronous workflow returning HTTP 202 Accepted.
- **Step 1 - Deliverable Inspection (GPT-4o Vision):** Compares submitted images, PDFs, or files against stated deliverable rubrics.
- **Step 2 - Trust Cross-Check (KERNEL SDK):** Navigates to freelancer portfolio (GitHub, Behance, Dribbble) to verify authenticity and account activity.
- **Step 3 - Confidence Scoring:**
  $$\text{Score} = 0.75 \times \text{Match}_{\%} + 0.15 \times \text{Portfolio}_{\text{trust}} + 0.10 \times \text{Completeness}$$
  *(Fallback without KERNEL: $0.85 \times \text{Match}_{\%} + 0.15 \times \text{Completeness}$)*
- **Decision Engine:**
  - $\ge 80$: **AUTO_APPROVED** $\rightarrow$ Partial Capture $\rightarrow$ Freelancer Payout.
  - $50 - 79$: **NEEDS_CLIENT_REVIEW** $\rightarrow$ Client approves or rejects in UI.
  - $< 50$: **AUTO_REJECTED** $\rightarrow$ Rejection with actionable remediation feedback.

### 3.5 Financial Ledger & Partial Capture Engine
- Partial capture via `/v2/payments/authorizations/{authId}/capture` with `final_capture: false`.
- Final milestone sets `final_capture: true` to release unused hold authorizations.
- Append-only `money_ledger` tracking every financial event with its PayPal transaction ID.
- Configurable platform fee (default `0%` in sandbox demo, configurable up to 5%).

### 3.6 Dispute & Safety Protocols
- Client dispute flag immediately freezes further captures and payouts.
- AI Evidence Packet generated automatically for audit.
- Hard safety cap: Single milestones $> \$500$ never auto-approve; always require explicit client sign-off.
- Prompt injection detection: uploaded files containing adversarial prompt injections are sanitized, flagged, and capped at confidence score $\le 49$.

---

## 4. Non-Functional Requirements

| Metric | Target | Rationale |
|---|---|---|
| **Verification Latency** | $< 20$ seconds | Keeps user engaged; enables live demo and fast turnaround. |
| **Payment Idempotency** | 100% | Every capture and payout uses stable idempotency keys to eliminate double-charges. |
| **API Availability** | 99.9% | Cloud deployment on Render with automatic health probes (`/healthz`). |
| **Ledger Integrity** | Zero deviation | Append-only ledger enforced by database constraints; ledger sum must match project captured total. |
| **Compliance** | Sandbox Ready | Sandbox environment for hackathon; architected for PayPal Commerce Platform delayed disbursement. |

---

## 5. Success Metrics for Hackathon Demo

1. **End-to-End Money Loop:** Successfully authorize $200, perform 3 partial captures ($50, $70, $80), execute 3 payouts, and void/complete the authorization.
2. **AI in the Money Core:** The AI autonomously decides whether to trigger PayPal capture and payout without human intervention when score $\ge 80$.
3. **Complete Traceability:** Every event visible on the AG Grid transaction ledger with clickable PayPal IDs and timestamps.
4. **Resilience:** Graceful handling of network timeouts, KERNEL fallbacks, and prompt injection attacks.
