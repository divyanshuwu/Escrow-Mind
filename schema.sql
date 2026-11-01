-- ==============================================================================
-- EscrowMind: AI Freelance Escrow Agent
-- Database Schema DDL & Invariants (PostgreSQL / Supabase)
-- ==============================================================================

-- 1. EXTENSIONS
create extension if not exists "uuid-ossp";
create extension if not exists "pgcrypto";

-- 2. ENUM TYPES
create type user_role as enum ('client', 'freelancer', 'admin');
create type project_status as enum (
  'DRAFT',
  'AWAITING_APPROVAL',
  'AUTHORIZED',
  'IN_PROGRESS',
  'COMPLETED',
  'CANCELLED',
  'EXPIRED'
);
create type milestone_status as enum (
  'PENDING',
  'SUBMITTED',
  'VERIFYING',
  'NEEDS_CLIENT_REVIEW',
  'REJECTED',
  'VERIFIED',
  'CAPTURED',
  'PAID_OUT',
  'FAILED',
  'DISPUTED'
);
create type dispute_status as enum (
  'OPEN',
  'UNDER_REVIEW',
  'REFUNDED',
  'RELEASED',
  'DISMISSED'
);
create type ledger_kind as enum (
  'AUTHORIZE',
  'CAPTURE',
  'PAYOUT',
  'FEE',
  'VOID',
  'REFUND',
  'REAUTHORIZE'
);

-- 3. TABLES

-- 3.1 USERS TABLE
create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  email text unique not null,
  paypal_email text,
  role user_role not null default 'client',
  portfolio_url text,
  created_at timestamptz default now()
);

-- 3.2 PROJECTS TABLE
create table if not exists projects (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references users(id) not null,
  freelancer_id uuid references users(id),
  raw_prompt text not null,
  total_amount numeric(10,2) not null check (total_amount between 5 and 10000),
  currency char(3) default 'USD',
  paypal_order_id text,
  paypal_authorization_id text,
  authorized_at timestamptz,
  authorization_expires_at timestamptz,
  last_reauthorized_at timestamptz,
  captured_total numeric(10,2) default 0.00 check (captured_total >= 0),
  status project_status default 'DRAFT',
  created_at timestamptz default now()
);

-- 3.3 MILESTONES TABLE
create table if not exists milestones (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references projects(id) on delete cascade not null,
  seq int not null check (seq between 1 and 10),
  title text not null,
  description text,
  deliverables jsonb default '[]'::jsonb,
  amount numeric(10,2) not null check (amount > 0),
  deadline timestamptz,
  status milestone_status default 'PENDING',
  unique (project_id, seq)
);

-- 3.4 SUBMISSIONS TABLE
create table if not exists submissions (
  id uuid primary key default gen_random_uuid(),
  milestone_id uuid references milestones(id) on delete cascade not null,
  file_urls text[] not null,
  note text,
  ai_verification_score int check (ai_verification_score between 0 and 100),
  ai_report_json jsonb default '{}'::jsonb,
  decision text, -- AUTO_APPROVED | NEEDS_REVIEW | AUTO_REJECTED | CLIENT_APPROVED | CLIENT_REJECTED
  paypal_capture_id text,
  paypal_payout_batch_id text,
  paypal_payout_item_id text,
  created_at timestamptz default now()
);

-- 3.5 PAYPAL EVENTS (Webhook Deduplication & Audit)
create table if not exists paypal_events (
  event_id text primary key,
  event_type text not null,
  resource_id text,
  payload jsonb not null,
  processed_at timestamptz default now()
);

-- 3.6 MONEY LEDGER (Append-Only Financial Log)
create table if not exists money_ledger (
  id bigserial primary key,
  project_id uuid references projects(id) not null,
  milestone_id uuid references milestones(id),
  kind ledger_kind not null,
  amount numeric(10,2) not null,
  fee_amount numeric(10,2) default 0.00,
  paypal_id text not null,
  created_at timestamptz default now()
);

-- 3.7 DISPUTES TABLE
create table if not exists disputes (
  id uuid primary key default gen_random_uuid(),
  milestone_id uuid references milestones(id) on delete cascade not null,
  client_id uuid references users(id) not null,
  reason text not null,
  evidence_packet jsonb default '{}'::jsonb,
  status dispute_status default 'OPEN',
  resolved_by uuid references users(id),
  resolution_notes text,
  resolved_at timestamptz,
  created_at timestamptz default now()
);

-- 4. DATABASE INVARIANTS & INTEGRITY TRIGGERS

-- 4.1 Append-Only Money Ledger Guard (Disallows UPDATE and DELETE)
create or replace function enforce_append_only_ledger()
returns trigger as $$
begin
  raise exception 'money_ledger is strictly append-only. Modification or deletion is forbidden.';
end;
$$ language plpgsql;

drop trigger if exists trg_money_ledger_immutable on money_ledger;
create trigger trg_money_ledger_immutable
before update or delete on money_ledger
for each row execute function enforce_append_only_ledger();

-- 4.2 Milestone Sum Invariant Check on Project Authorization
create or replace function check_milestone_sum_match()
returns trigger as $$
declare
  total_milestones numeric(10,2);
begin
  if new.status in ('AWAITING_APPROVAL', 'AUTHORIZED') then
    select coalesce(sum(amount), 0) into total_milestones
    from milestones
    where project_id = new.id;

    if total_milestones <> new.total_amount then
      raise exception 'Sum of milestones (%) does not match project total_amount (%)',
        total_milestones, new.total_amount;
    end if;
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_verify_project_sum on projects;
create trigger trg_verify_project_sum
before update on projects
for each row execute function check_milestone_sum_match();

-- 5. ROW LEVEL SECURITY (RLS) POLICIES
alter table users enable row level security;
alter table projects enable row level security;
alter table milestones enable row level security;
alter table submissions enable row level security;
alter table money_ledger enable row level security;
alter table disputes enable row level security;

-- Projects: Clients can see their own; Freelancers can see assigned projects
create policy "Clients view own projects" on projects
  for select using (auth.uid() = client_id or auth.uid() = freelancer_id);

create policy "Clients insert own projects" on projects
  for insert with check (auth.uid() = client_id);

create policy "Clients update own projects" on projects
  for update using (auth.uid() = client_id);

-- Milestones: Participants can view milestones
create policy "Participants view milestones" on milestones
  for select using (
    exists (
      select 1 from projects
      where projects.id = milestones.project_id
        and (projects.client_id = auth.uid() or projects.freelancer_id = auth.uid())
    )
  );

-- Money Ledger: Visible to project participants
create policy "Participants view money ledger" on money_ledger
  for select using (
    exists (
      select 1 from projects
      where projects.id = money_ledger.project_id
        and (projects.client_id = auth.uid() or projects.freelancer_id = auth.uid())
    )
  );

-- 6. SEED DATA (For Sandbox Demo & Local Testing)
insert into users (id, email, paypal_email, role, portfolio_url)
values
  ('11111111-1111-1111-1111-111111111111', 'client@escrowmind.demo', 'sb-client@personal.example.com', 'client', null),
  ('22222222-2222-2222-2222-222222222222', 'freelancer@escrowmind.demo', 'sb-freelancer@personal.example.com', 'freelancer', 'https://github.com/freelancer-demo'),
  ('33333333-3333-3333-3333-333333333333', 'admin@escrowmind.demo', 'merchant@escrowmind.com', 'admin', null)
on conflict (id) do nothing;
