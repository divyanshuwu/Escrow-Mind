export type UserRole = 'client' | 'freelancer' | 'admin';

export type ProjectStatus =
  | 'DRAFT'
  | 'AWAITING_APPROVAL'
  | 'AUTHORIZED'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'EXPIRED';

export type MilestoneStatus =
  | 'PENDING'
  | 'SUBMITTED'
  | 'VERIFYING'
  | 'NEEDS_CLIENT_REVIEW'
  | 'REJECTED'
  | 'VERIFIED'
  | 'CAPTURED'
  | 'PAID_OUT'
  | 'FAILED'
  | 'DISPUTED';

export type DisputeStatus = 'OPEN' | 'UNDER_REVIEW' | 'REFUNDED' | 'RELEASED' | 'DISMISSED';

export type LedgerKind =
  | 'AUTHORIZE'
  | 'CAPTURE'
  | 'PAYOUT'
  | 'FEE'
  | 'VOID'
  | 'REFUND'
  | 'REAUTHORIZE';

export interface User {
  id: string;
  email: string;
  paypal_email?: string;
  role: UserRole;
  portfolio_url?: string;
  created_at?: string;
}

export interface Project {
  id: string;
  client_id: string;
  freelancer_id?: string;
  raw_prompt: string;
  total_amount: number;
  currency: string;
  paypal_order_id?: string;
  paypal_authorization_id?: string;
  authorized_at?: string;
  authorization_expires_at?: string;
  last_reauthorized_at?: string;
  captured_total: number;
  status: ProjectStatus;
  created_at?: string;
}

export interface Milestone {
  id: string;
  project_id: string;
  seq: number;
  title: string;
  description?: string;
  deliverables: string[];
  amount: number;
  deadline?: string;
  status: MilestoneStatus;
  paypal_capture_id?: string;
  paypal_payout_batch_id?: string;
}

export interface Submission {
  id: string;
  milestone_id: string;
  file_urls: string[];
  note?: string;
  ai_verification_score?: number;
  ai_report_json?: Record<string, any>;
  decision?: string;
  paypal_capture_id?: string;
  paypal_payout_batch_id?: string;
  created_at?: string;
}

export interface MoneyLedgerEntry {
  id: number;
  project_id: string;
  milestone_id?: string;
  kind: LedgerKind;
  amount: number;
  fee_amount?: number;
  paypal_id: string;
  created_at?: string;
}

export interface Dispute {
  id: string;
  milestone_id: string;
  client_id: string;
  reason: string;
  evidence_packet?: Record<string, any>;
  status: DisputeStatus;
  resolution_notes?: string;
  resolved_at?: string;
  created_at?: string;
}

export interface ParsedContractMilestone {
  seq: number;
  title: string;
  description: string;
  amount: number;
  deadline_days: number;
  deliverables: string[];
}

export interface ParsedContract {
  total_amount: number;
  currency: 'USD';
  deadline_days: number;
  deliverable_type: string;
  milestones: ParsedContractMilestone[];
}
