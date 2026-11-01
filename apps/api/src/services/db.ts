import {
  User,
  Project,
  Milestone,
  Submission,
  MoneyLedgerEntry,
  Dispute,
  ProjectStatus,
  MilestoneStatus,
  LedgerKind,
  DisputeStatus
} from '../types';

export class DatabaseService {
  private users: Map<string, User> = new Map();
  private projects: Map<string, Project> = new Map();
  private milestones: Map<string, Milestone> = new Map();
  private submissions: Map<string, Submission> = new Map();
  private moneyLedger: MoneyLedgerEntry[] = [];
  private disputes: Map<string, Dispute> = new Map();
  private paypalEvents: Set<string> = new Set();
  private ledgerSeq = 1;

  constructor() {
    this.seedDefaultUsers();
  }

  public seedDefaultUsers(): void {
    const defaultUsers: User[] = [
      {
        id: '11111111-1111-1111-1111-111111111111',
        email: 'client@escrowmind.demo',
        paypal_email: 'sb-client@personal.example.com',
        role: 'client',
      },
      {
        id: '22222222-2222-2222-2222-222222222222',
        email: 'freelancer@escrowmind.demo',
        paypal_email: 'sb-freelancer@personal.example.com',
        role: 'freelancer',
        portfolio_url: 'https://github.com/freelancer-demo',
      },
      {
        id: '33333333-3333-3333-3333-333333333333',
        email: 'admin@escrowmind.demo',
        paypal_email: 'merchant@escrowmind.com',
        role: 'admin',
      },
    ];

    for (const u of defaultUsers) {
      this.users.set(u.id, u);
    }
  }

  // --- Users ---
  public async getUserById(id: string): Promise<User | null> {
    return this.users.get(id) || null;
  }

  public async getUserByEmail(email: string): Promise<User | null> {
    for (const u of this.users.values()) {
      if (u.email.toLowerCase() === email.toLowerCase()) return u;
    }
    return null;
  }

  public async createUser(user: User): Promise<User> {
    this.users.set(user.id, user);
    return user;
  }

  // --- Projects ---
  public async createProject(project: Project): Promise<Project> {
    this.projects.set(project.id, { ...project });
    return project;
  }

  public async getProjectById(id: string): Promise<Project | null> {
    const p = this.projects.get(id);
    return p ? { ...p } : null;
  }

  public async listProjectsForUser(userId: string): Promise<Project[]> {
    const list: Project[] = [];
    for (const p of this.projects.values()) {
      if (p.client_id === userId || p.freelancer_id === userId) {
        list.push({ ...p });
      }
    }
    return list;
  }

  public async updateProject(id: string, updates: Partial<Project>): Promise<Project> {
    const existing = this.projects.get(id);
    if (!existing) throw new Error(`Project ${id} not found`);

    const updated = { ...existing, ...updates };

    // Invariant: If moving to AWAITING_APPROVAL or AUTHORIZED, milestone sum must match total_amount
    if (updates.status === 'AWAITING_APPROVAL' || updates.status === 'AUTHORIZED') {
      const milestones = await this.getMilestonesByProjectId(id);
      const sum = milestones.reduce((acc, m) => acc + Number(m.amount), 0);
      if (Math.abs(sum - Number(updated.total_amount)) > 0.005) {
        throw new Error(`CONTRACT_SUM_MISMATCH: Milestones sum ($${sum}) != Project total ($${updated.total_amount})`);
      }
    }

    this.projects.set(id, updated);
    return updated;
  }

  // --- Milestones ---
  public async createMilestone(milestone: Milestone): Promise<Milestone> {
    this.milestones.set(milestone.id, { ...milestone });
    return milestone;
  }

  public async getMilestoneById(id: string): Promise<Milestone | null> {
    const m = this.milestones.get(id);
    return m ? { ...m } : null;
  }

  public async getMilestonesByProjectId(projectId: string): Promise<Milestone[]> {
    const list: Milestone[] = [];
    for (const m of this.milestones.values()) {
      if (m.project_id === projectId) {
        list.push({ ...m });
      }
    }
    return list.sort((a, b) => a.seq - b.seq);
  }

  public async updateMilestone(
    id: string,
    newStatus: MilestoneStatus,
    extraUpdates: Partial<Milestone> = {},
    guardStatus?: MilestoneStatus
  ): Promise<Milestone | null> {
    const existing = this.milestones.get(id);
    if (!existing) throw new Error(`Milestone ${id} not found`);

    if (guardStatus && existing.status !== guardStatus) {
      // Atomic guard failed: status already transitioned
      return null;
    }

    const updated: Milestone = {
      ...existing,
      ...extraUpdates,
      status: newStatus,
    };
    this.milestones.set(id, updated);
    return updated;
  }

  // --- Submissions ---
  public async createSubmission(submission: Submission): Promise<Submission> {
    this.submissions.set(submission.id, { ...submission, created_at: new Date().toISOString() });
    return submission;
  }

  public async getSubmissionById(id: string): Promise<Submission | null> {
    const s = this.submissions.get(id);
    return s ? { ...s } : null;
  }

  public async getSubmissionsByMilestoneId(milestoneId: string): Promise<Submission[]> {
    const list: Submission[] = [];
    for (const s of this.submissions.values()) {
      if (s.milestone_id === milestoneId) list.push({ ...s });
    }
    return list.sort((a, b) => (a.created_at || '').localeCompare(b.created_at || ''));
  }

  public async updateSubmission(id: string, updates: Partial<Submission>): Promise<Submission> {
    const existing = this.submissions.get(id);
    if (!existing) throw new Error(`Submission ${id} not found`);
    const updated = { ...existing, ...updates };
    this.submissions.set(id, updated);
    return updated;
  }

  // --- Money Ledger (Append-Only) ---
  public async recordLedger(
    kind: LedgerKind,
    projectId: string,
    milestoneId: string | undefined,
    amount: number,
    paypalId: string,
    feeAmount: number = 0
  ): Promise<MoneyLedgerEntry> {
    const entry: MoneyLedgerEntry = {
      id: this.ledgerSeq++,
      project_id: projectId,
      milestone_id: milestoneId,
      kind,
      amount,
      fee_amount: feeAmount,
      paypal_id: paypalId,
      created_at: new Date().toISOString(),
    };
    this.moneyLedger.push(entry);
    return entry;
  }

  public async getLedgerByProjectId(projectId: string): Promise<MoneyLedgerEntry[]> {
    return this.moneyLedger.filter((l) => l.project_id === projectId);
  }

  // --- Webhook Events Deduplication ---
  public async insertEventIfNew(eventId: string): Promise<boolean> {
    if (this.paypalEvents.has(eventId)) {
      return false; // Duplicate
    }
    this.paypalEvents.add(eventId);
    return true; // Newly inserted
  }

  // --- Disputes ---
  public async createDispute(dispute: Dispute): Promise<Dispute> {
    this.disputes.set(dispute.id, { ...dispute, created_at: new Date().toISOString() });
    return dispute;
  }

  public async getDisputeByMilestoneId(milestoneId: string): Promise<Dispute | null> {
    for (const d of this.disputes.values()) {
      if (d.milestone_id === milestoneId) return { ...d };
    }
    return null;
  }

  public async updateDispute(id: string, updates: Partial<Dispute>): Promise<Dispute> {
    const existing = this.disputes.get(id);
    if (!existing) throw new Error(`Dispute ${id} not found`);
    const updated = { ...existing, ...updates };
    this.disputes.set(id, updated);
    return updated;
  }

  // Reset database (for unit tests)
  public clearAll(): void {
    this.users.clear();
    this.projects.clear();
    this.milestones.clear();
    this.submissions.clear();
    this.moneyLedger = [];
    this.disputes.clear();
    this.paypalEvents.clear();
    this.ledgerSeq = 1;
    this.seedDefaultUsers();
  }
}

export const db = new DatabaseService();
