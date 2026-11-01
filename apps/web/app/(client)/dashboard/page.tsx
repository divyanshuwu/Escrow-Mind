'use client';

import React, { useState, useEffect } from 'react';
import { MilestoneGrid, GridMilestone } from '@/components/MilestoneGrid';
import { PayPalApprove } from '@/components/PayPalApprove';
import { Timeline, LedgerEvent } from '@/components/Timeline';
import { Sparkles, Shield, ArrowRight, DollarSign, RefreshCw, FileText } from 'lucide-react';

export default function ClientDashboard() {
  const [prompt, setPrompt] = useState('Logo design, brand guide and social banners in 3 days for $200');
  const [loading, setLoading] = useState(false);
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [projectStatus, setProjectStatus] = useState<string>('DRAFT');
  const [totalBudget, setTotalBudget] = useState(200);
  const [milestones, setMilestones] = useState<GridMilestone[]>([]);
  const [ledgerEntries, setLedgerEntries] = useState<LedgerEvent[]>([]);
  const [authorizationId, setAuthorizationId] = useState<string | null>(null);
  const [feedbackMsg, setFeedbackMsg] = useState<string | null>(null);

  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080';

  const handleParseContract = async () => {
    setLoading(true);
    setFeedbackMsg(null);
    try {
      const res = await fetch(`${apiUrl}/api/projects/parse`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer mock-client-jwt',
        },
        body: JSON.stringify({ prompt }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || 'Failed to parse brief');

      setTotalBudget(data.total_amount);
      const gridMilestones = data.milestones.map((m: any) => ({
        id: `ms-preview-${m.seq}`,
        seq: m.seq,
        title: m.title,
        description: m.description,
        amount: m.amount,
        status: 'PENDING',
        deliverables: m.deliverables,
      }));
      setMilestones(gridMilestones);
      setProjectStatus('CONTRACT_GENERATED');
    } catch (err: any) {
      setFeedbackMsg(`Error: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmContract = async () => {
    setLoading(true);
    setFeedbackMsg(null);
    try {
      const res = await fetch(`${apiUrl}/api/projects`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer mock-client-jwt',
        },
        body: JSON.stringify({
          rawPrompt: prompt,
          contract: {
            total_amount: totalBudget,
            currency: 'USD',
            deadline_days: 3,
            deliverable_type: 'graphic_design',
            milestones: milestones.map((m) => ({
              seq: m.seq,
              title: m.title,
              description: m.description,
              amount: m.amount,
              deliverables: m.deliverables || ['Draft Asset'],
            })),
          },
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || 'Failed to create project');

      setActiveProjectId(data.projectId);
      setProjectStatus('AWAITING_APPROVAL');
      setFeedbackMsg('Contract confirmed! Proceed to authorize escrow with PayPal.');
    } catch (err: any) {
      setFeedbackMsg(`Error: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleAuthSuccess = async (authId: string) => {
    setAuthorizationId(authId);
    setProjectStatus('AUTHORIZED');
    setFeedbackMsg(`Funds successfully authorized! Hold ID: ${authId}`);
    fetchLedger();
  };

  const fetchLedger = async () => {
    if (!activeProjectId) return;
    try {
      const res = await fetch(`${apiUrl}/api/projects/${activeProjectId}/ledger`, {
        headers: { Authorization: 'Bearer mock-client-jwt' },
      });
      const data = await res.json();
      if (res.ok && data.entries) {
        setLedgerEntries(data.entries);
      }
    } catch (e) {
      console.warn('Failed to fetch ledger:', e);
    }
  };

  return (
    <div className="space-y-8">
      {/* Title & Badge */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">Client Escrow Dashboard</h1>
          <p className="text-sm text-slate-500">
            Define requirements, edit milestones in AG Grid, and authorize zero-upfront holds with PayPal.
          </p>
        </div>
        {authorizationId && (
          <div className="flex items-center space-x-2 bg-emerald-50 border border-emerald-200 px-3 py-1.5 rounded-lg">
            <Shield className="w-4 h-4 text-emerald-600" />
            <span className="text-xs font-mono font-bold text-emerald-800">Hold Active: {authorizationId}</span>
          </div>
        )}
      </div>

      {feedbackMsg && (
        <div className="p-3 rounded-lg text-xs font-medium bg-blue-50 border border-blue-200 text-blue-900">
          {feedbackMsg}
        </div>
      )}

      {/* Step 1: Prompt Input */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
        <div className="flex items-center space-x-2">
          <Sparkles className="w-5 h-5 text-paypal-light" />
          <h3 className="font-bold text-slate-900 text-base">Step 1: Plain Language Project Brief</h3>
        </div>
        <div className="flex gap-3">
          <input
            type="text"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="e.g. Logo design, 3 days, $200"
            className="flex-1 px-4 py-3 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-paypal-blue text-sm"
          />
          <button
            onClick={handleParseContract}
            disabled={loading}
            className="px-6 py-3 bg-paypal-blue hover:bg-paypal-dark text-white font-bold text-sm rounded-xl transition flex items-center space-x-2 disabled:opacity-50"
          >
            <span>{loading ? 'Structuring...' : 'Generate Contract'}</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Step 2: Milestone Review in AG Grid */}
      {milestones.length > 0 && (
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-5">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-bold text-slate-900 text-base">Step 2: AI Contract & Milestone Customization</h3>
              <p className="text-xs text-slate-500">
                Double-click any cell to adjust titles, scopes, or dollar amounts.
              </p>
            </div>
            {projectStatus === 'CONTRACT_GENERATED' && (
              <button
                onClick={handleConfirmContract}
                disabled={loading}
                className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-lg transition shadow-sm"
              >
                Confirm Contract ($ {totalBudget})
              </button>
            )}
          </div>

          <MilestoneGrid
            milestones={milestones}
            totalBudget={totalBudget}
            isEditable={projectStatus === 'CONTRACT_GENERATED' || projectStatus === 'DRAFT'}
            onMilestonesChange={setMilestones}
          />
        </div>
      )}

      {/* Step 3: PayPal Authorization */}
      {projectStatus === 'AWAITING_APPROVAL' && activeProjectId && (
        <div className="max-w-xl mx-auto">
          <PayPalApprove
            projectId={activeProjectId}
            totalAmount={totalBudget}
            onAuthorizationSuccess={handleAuthSuccess}
          />
        </div>
      )}

      {/* Step 4: Live Ledger & Audit Timeline */}
      {activeProjectId && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-slate-900 text-base">Immutable Money Ledger</h3>
              <button
                onClick={fetchLedger}
                className="text-xs text-slate-500 hover:text-slate-800 flex items-center space-x-1"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Refresh</span>
              </button>
            </div>
            <Timeline entries={ledgerEntries} />
          </div>

          <div className="bg-slate-50 p-6 rounded-2xl border border-slate-200 space-y-4">
            <h4 className="font-bold text-slate-900 text-sm">Escrow Guarantees</h4>
            <ul className="text-xs text-slate-600 space-y-2.5">
              <li className="flex items-start space-x-2">
                <Shield className="w-4 h-4 text-emerald-600 flex-shrink-0 mt-0.5" />
                <span><strong>No Advance Charge:</strong> Funds are held via authorization; your card is only debited on verified milestone completion.</span>
              </li>
              <li className="flex items-start space-x-2">
                <DollarSign className="w-4 h-4 text-paypal-blue flex-shrink-0 mt-0.5" />
                <span><strong>Autonomous Payout:</strong> Freelancers get paid instantly upon passing AI multimodal verification.</span>
              </li>
              <li className="flex items-start space-x-2">
                <FileText className="w-4 h-4 text-purple-600 flex-shrink-0 mt-0.5" />
                <span><strong>Dispute Protection:</strong> Freeze captures anytime with our automated AI Evidence Packet generator.</span>
              </li>
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
