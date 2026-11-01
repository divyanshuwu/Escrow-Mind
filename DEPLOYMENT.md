# EscrowMind Deployment Guide
> Step-by-step instructions to deploy EscrowMind to **Render** and **Supabase** in under 5 minutes.

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/divyanshuwu/Escrow-Mind)

---

## Architecture Overview

EscrowMind is deployed across two cloud providers:
1. **Supabase (Database & Storage):** Hosts PostgreSQL DDL, Row Level Security, append-only ledger triggers, and private deliverable storage buckets.
2. **Render (Compute & Orchestration):** Hosts the Express API Web Service, Next.js 14 Web Service, and Render Workflows asynchronous verification runner.

---

## Step 1: Database Setup (Supabase)

1. Create a free project on [supabase.com](https://supabase.com).
2. Go to the **SQL Editor** in your Supabase dashboard.
3. Copy the contents of [`schema.sql`](https://github.com/divyanshuwu/Escrow-Mind/blob/main/schema.sql) and click **Run**.
   - This provisions all enums, tables (`users`, `projects`, `milestones`, `submissions`, `money_ledger`, `disputes`), RLS policies, and immutable ledger triggers.
4. Go to **Storage** in the Supabase sidebar and create a private bucket named `submissions`.
5. Under **Project Settings** $\rightarrow$ **API**, copy:
   - `Project URL` $\rightarrow$ `SUPABASE_URL`
   - `service_role` secret key $\rightarrow$ `SUPABASE_SERVICE_ROLE_KEY`
   - `anon` public key $\rightarrow$ `NEXT_PUBLIC_SUPABASE_ANON_KEY`

---

## Step 2: 1-Click Cloud Deployment (Render Blueprint)

We have configured an Infrastructure-as-Code blueprint in [`render.yaml`](https://github.com/divyanshuwu/Escrow-Mind/blob/main/render.yaml).

### Method A: Direct Deploy Button
Click the button below to deploy the entire blueprint automatically:
👉 **[Deploy EscrowMind on Render](https://render.com/deploy?repo=https://github.com/divyanshuwu/Escrow-Mind)**

### Method B: Manual Render Setup
1. Log into [dashboard.render.com](https://dashboard.render.com).
2. Click **New +** $\rightarrow$ **Blueprint**.
3. Connect your repository: `https://github.com/divyanshuwu/Escrow-Mind`.
4. Render will automatically detect `render.yaml` and configure two linked services:
   - **`escrowmind-api`**: Node Web Service running Express + TypeScript backend.
   - **`escrowmind-web`**: Node Web Service running Next.js 14 App Router frontend.
5. In the Render configuration screen, enter your secret environment variables:
   - `PAYPAL_CLIENT_ID` & `PAYPAL_CLIENT_SECRET` (from [developer.paypal.com](https://developer.paypal.com))
   - `OPENAI_API_KEY` (from [platform.openai.com](https://platform.openai.com))
   - `KERNEL_API_KEY` (from [kernel.sh](https://kernel.sh) or leave blank if using vision fallback)
   - `SUPABASE_URL` & `SUPABASE_SERVICE_ROLE_KEY`
6. Click **Apply**. Render will automatically build, link, and deploy both services!

---

## Step 3: Register PayPal Sandbox Webhook

Once your `escrowmind-api` service finishes deploying:
1. Copy the backend URL (e.g. `https://escrowmind-api.onrender.com`).
2. Log into [developer.paypal.com](https://developer.paypal.com) $\rightarrow$ **Apps & Credentials** $\rightarrow$ Sandbox App.
3. Click **Add Webhook** and set URL to:
   ```
   https://<your-render-backend-url>/api/webhooks/paypal
   ```
4. Subscribe to the following events:
   - `PAYMENT.AUTHORIZATION.CREATED`
   - `PAYMENT.AUTHORIZATION.VOIDED`
   - `PAYMENT.CAPTURE.COMPLETED`
   - `PAYMENT.CAPTURE.DENIED`
   - `PAYMENT.CAPTURE.REFUNDED`
   - `PAYMENT.PAYOUTSBATCH.SUCCESS`
   - `PAYMENT.PAYOUTS-ITEM.SUCCEEDED`
   - `PAYMENT.PAYOUTS-ITEM.FAILED`
   - `CHECKOUT.ORDER.APPROVED`
5. Copy the generated **Webhook ID** and paste it into the `PAYPAL_WEBHOOK_ID` environment variable in your Render dashboard.

---

## Step 4: Verification

Open your deployed frontend URL (e.g. `https://escrowmind-web.onrender.com/dashboard`):
- [x] Create a project prompt (`"Logo design in 3 days for $200"`).
- [x] Edit and confirm milestones in AG Grid.
- [x] Authorize the hold via PayPal Sandbox.
- [x] Switch to `/workspace`, upload deliverables, and observe sub-20s automated AI deliverable verification and payout!
