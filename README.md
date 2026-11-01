# EscrowMind: AI Freelance Escrow Agent
> **Autonomous Fiduciary AI for Decentralized & Micro-Milestone Commerce**  
> *PayPal AI Hackathon 2026 | Track: Agentic Commerce, Open Innovation*

[![PayPal REST](https://img.shields.io/badge/PayPal-REST_API_v2-003087?logo=paypal&logoColor=white)](https://developer.paypal.com)
[![Next.js 14](https://img.shields.io/badge/Frontend-Next.js_14-black?logo=next.js)](https://nextjs.org)
[![Express TS](https://img.shields.io/badge/Backend-Node.js_20_TS-339933?logo=node.js)](https://nodejs.org)
[![Supabase Postgres](https://img.shields.io/badge/Database-Supabase_Postgres-3ECF8E?logo=supabase)](https://supabase.com)
[![Render Workflows](https://img.shields.io/badge/Orchestration-Render_Workflows-46E3B7?logo=render)](https://render.com)
[![AG Grid](https://img.shields.io/badge/UI_Grid-AG_Grid_Enterprise-00A2FF)](https://www.ag-grid.com)
[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/divyanshuwu/Escrow-Mind)

---

## 1. What is EscrowMind?

EscrowMind is an autonomous AI agent that manages escrow between clients and freelancers. It eliminates the 20% commission rates, multi-week payout delays, and subjective dispute processes of legacy freelance platforms (Upwork, Fiverr) using **PayPal's enterprise payment rails** and **multimodal deliverable auditing**.

### How It Works in 60 Seconds
1. **Plain Request:** The client types a plain brief: *"Logo design, 3 days, $200"*.
2. **AI Contract Generation:** The **Contract Agent** (GPT-4o) structures it into mathematical milestones ($50, $70, $80) with clear deliverables. The client edits and confirms in an interactive **AG Grid**.
3. **PayPal Escrow Authorization:** The client approves a single PayPal hold (`intent: AUTHORIZE`) for $200. **Money is reserved, NOT charged upfront.**
4. **Multimodal Deliverable Verification:** The freelancer uploads work per milestone. The **Verifier Agent** audits files using **GPT-4o Vision** and verifies portfolio trust via **KERNEL Browser Agents**.
5. **Autonomous Micro-Release:**
   - **Score $\ge 80$:** The backend autonomously executes a partial capture on PayPal and triggers an instant freelancer payout via PayPal Payouts.
   - **Score $50 - 79$:** Escalated to client for 1-click manual sign-off.
   - **Score $< 50$:** Rejected with actionable, objective remediation feedback.
6. **100% Traceability:** Every dollar, capture, and payout is immutably logged with its PayPal transaction ID.

---

## 2. Documentation Architecture

Detailed documentation is organized inside the [`docs/`](file:///c:/Users/dell/OneDrive/Desktop/EscrowMind/docs) folder:

| Chapter | Document | Core Content |
|---|---|---|
| **01** | [Product Requirements Document](file:///c:/Users/dell/OneDrive/Desktop/EscrowMind/docs/01_PRODUCT_REQUIREMENTS_DOCUMENT.md) | Vision, market context, user personas, functional specs, safety limits, KPIs. |
| **02** | [System Architecture](file:///c:/Users/dell/OneDrive/Desktop/EscrowMind/docs/02_SYSTEM_ARCHITECTURE.md) | High-level topology, Mermaid sequence diagrams, dual-engine async execution, threat model. |
| **03** | [PayPal Integration & Money Flow](file:///c:/Users/dell/OneDrive/Desktop/EscrowMind/docs/03_PAYPAL_INTEGRATION_AND_MONEY_FLOW.md) | `AUTHORIZE` vs `CAPTURE`, 3-day honor period, reauthorization job, Payouts, webhooks, idempotency. |
| **04** | [Database Schema & Ledger](file:///c:/Users/dell/OneDrive/Desktop/EscrowMind/docs/04_DATABASE_SCHEMA_AND_LEDGER.md) | PostgreSQL schema dictionary, append-only `money_ledger`, state machines, integrity invariants. |
| **05** | [Internal API Specification](file:///c:/Users/dell/OneDrive/Desktop/EscrowMind/docs/05_INTERNAL_API_SPECIFICATION.md) | 16 REST endpoints, Zod request/response schemas, error dictionary, admin arbitration routes. |
| **06** | [AI Agents & Verification Pipeline](file:///c:/Users/dell/OneDrive/Desktop/EscrowMind/docs/06_AI_AGENTS_AND_VERIFICATION_PIPELINE.md) | Contract Agent prompts, Verifier Vision prompts, KERNEL scraper, prompt injection defenses. |
| **07** | [Hackathon Pitch & Sponsor Alignment](file:///c:/Users/dell/OneDrive/Desktop/EscrowMind/docs/07_HACKATHON_PITCH_AND_SPONSORS.md) | Track alignment (Agentic Commerce, Open Innovation), business model, sponsor integration scorecards. |
| **08** | [3-Minute Demo Script & Sandbox Guide](file:///c:/Users/dell/OneDrive/Desktop/EscrowMind/docs/08_DEMO_SCRIPT_AND_TESTING_GUIDE.md) | Second-by-second live pitch script, 15 sandbox test scenarios, smoke test curl commands. |

---

## 3. Quickstart Guide (Local Development & Testing)

### 3.1 Prerequisites
- Node.js 20+ installed
- PayPal Developer Sandbox Account (Client & Business Merchant)
- Supabase Project (or use local mock mode)

### 3.2 Environment Setup
Copy the environment template and populate your keys:
```bash
cp .env.example .env
```

For rapid offline evaluation without live API keys, EscrowMind includes **Zero-Dependency Mock Toggles**:
```ini
MOCK_AI=true             # Simulates Contract & Vision responses in 50ms
MOCK_KERNEL=true         # Simulates KERNEL browser agent trust response
DEV_SKIP_VERIFY=true     # Allows testing PayPal webhooks locally without ngrok SSL signatures
PLATFORM_FEE_PERCENT=0   # 1:1 pass-through math for clean demo numbers
```

### 3.3 Database Migration
Run the SQL DDL script in your Supabase SQL Editor:
```bash
# Execute schema.sql in Supabase Dashboard
psql -h <db.supabase.co> -U postgres -d postgres -f schema.sql
```

### 3.4 Running the Application
```bash
# Install backend dependencies
cd apps/api
npm install
npm run dev

# In another terminal, start the frontend
cd apps/web
npm install
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) to view the client dashboard.

---

## 4. Repository Structure

```
EscrowMind/
├── apps/
│   ├── api/                    # Express backend (TypeScript)
│   │   ├── src/
│   │   │   ├── routes/         # projects, paypal, milestones, workflows, webhooks, invoices
│   │   │   ├── services/       # paypal, contractAgent, verifierAgent, kernel, storage
│   │   │   ├── middleware/     # auth, validate, rawBody, errorHandler
│   │   │   └── app.ts          # Express application setup
│   │   └── tests/              # Jest/Vitest automated unit & integration test suites
│   └── web/                    # Next.js 14 App Router frontend
│       ├── app/                # (client)/dashboard, (freelancer)/workspace, paypal/return
│       └── components/         # MilestoneGrid (AG Grid), PayPalApprove, Timeline
├── workflows/
│   └── verify.ts               # Render Workflows durable pipeline definition
├── docs/                       # Complete 8-part engineering & hackathon documentation suite
├── schema.sql                  # Supabase PostgreSQL DDL, RLS policies, triggers & seeds
├── .env.example                # Unified environment variables template
└── escrowmind.postman_collection.json # Complete 15-case Postman collection
```

---

## 5. Sponsor Technologies Leveraged

- **PayPal:** Enterprise Orders `AUTHORIZE`, Partial `CAPTURE`, Payouts REST, Invoicing, Webhooks.
- **AG Grid:** Master-detail client/freelancer dashboards with live editing and transaction auditing.
- **Render Workflows:** Distributed async step functions for durable multimodal file verification.
- **KERNEL:** Autonomous headless browser agent checking external freelancer reputation.
- **APIMatic:** Type-safe SDK generation and OpenAPI context for autonomous agent tool execution.

---

## 6. License
MIT License. Built for the **PayPal AI Hackathon 2026**.
