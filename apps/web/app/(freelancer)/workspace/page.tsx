'use client';

import React, { useState } from 'react';
import { UploadCloud, CheckCircle, Clock, AlertTriangle, FileText, DollarSign, RefreshCw } from 'lucide-react';

interface MilestoneItem {
  id: string;
  seq: number;
  title: string;
  description: string;
  amount: number;
  status: 'PENDING' | 'SUBMITTED' | 'VERIFYING' | 'NEEDS_CLIENT_REVIEW' | 'VERIFIED' | 'CAPTURED' | 'PAID_OUT' | 'REJECTED';
  deliverables: string[];
}

export default function FreelancerWorkspace() {
  const [projectId, setProjectId] = useState('');
  const [selectedMilestone, setSelectedMilestone] = useState<MilestoneItem | null>(null);
  const [uploadNote, setUploadNote] = useState('');
  const [fileName, setFileName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<any>(null);

  const [milestones, setMilestones] = useState<MilestoneItem[]>([
    {
      id: 'm1',
      seq: 1,
      title: 'Initial Concepts & Logo Sketches',
      description: '3 distinct concept directions in PNG format',
      amount: 50.0,
      status: 'PENDING',
      deliverables: ['3x PNG concepts', 'Design notes'],
    },
    {
      id: 'm2',
      seq: 2,
      title: 'Selected Concept Refinement',
      description: 'Revisions on chosen direction and style palette',
      amount: 70.0,
      status: 'PENDING',
      deliverables: ['High-res PNG', 'Color specs'],
    },
    {
      id: 'm3',
      seq: 3,
      title: 'Final Assets & Vector Source Delivery',
      description: 'Complete source packages in AI, SVG and export assets',
      amount: 80.0,
      status: 'PENDING',
      deliverables: ['Vector SVG', 'AI Source Package', 'Social Banners'],
    },
  ]);

  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080';

  const handleSimulatedSubmit = async (milestone: MilestoneItem) => {
    setSubmitting(true);
    setFeedback(null);
    try {
      // Step 1: Request upload url
      const uploadRes = await fetch(`${apiUrl}/api/milestones/${milestone.id}/upload-url`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer mock-freelancer-jwt',
        },
        body: JSON.stringify({
          filename: fileName || 'logo_concepts.png',
          contentType: 'image/png',
        }),
      });
      const uploadData = await uploadRes.json();
      const path = uploadData.path || `submissions/${milestone.id}/logo_concepts.png`;

      // Step 2: Submit milestone
      const submitRes = await fetch(`${apiUrl}/api/milestones/${milestone.id}/submit`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer mock-freelancer-jwt',
        },
        body: JSON.stringify({
          paths: [path],
          note: uploadNote || 'Initial deliverables attached per milestone criteria.',
        }),
      });
      const submitData = await submitRes.json();

      // Update milestone status in UI
      setMilestones((prev) =>
        prev.map((m) => (m.id === milestone.id ? { ...m, status: 'VERIFYING' } : m))
      );

      // Trigger verification callback simulation
      setTimeout(async () => {
        const verifyRes = await fetch(`${apiUrl}/api/workflows/verify`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Internal-Secret': 'long-random-string',
          },
          body: JSON.stringify({
            submissionId: submitData.submissionId || 'sub-demo-01',
            score: 88,
            report: {
              score: 88,
              deliverables: milestone.deliverables.map((d) => ({
                name: d,
                found: true,
                confidence: 0.92,
                reason: `Verified asset matching '${d}'`,
              })),
              summary_for_client: 'All deliverables verified at high confidence.',
            },
          }),
        });

        const verifyData = await verifyRes.json();
        setFeedback(verifyData);

        setMilestones((prev) =>
          prev.map((m) => (m.id === milestone.id ? { ...m, status: 'PAID_OUT' } : m))
        );
        setSubmitting(false);
      }, 2000);
    } catch (e: any) {
      console.warn('Simulation error:', e);
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-black text-slate-900 tracking-tight">Freelancer Workspace</h1>
        <p className="text-sm text-slate-500">
          Upload deliverables per milestone. GPT-4o Vision audits files and releases instant PayPal payouts.
        </p>
      </div>

      {feedback && (
        <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 space-y-1">
          <div className="flex items-center space-x-2 font-bold text-sm">
            <CheckCircle className="w-4 h-4 text-emerald-600" />
            <span>Milestone Verified & Paid Out!</span>
          </div>
          <p className="text-xs">
            PayPal Capture ID: <code className="font-mono bg-white px-1.5 py-0.5 rounded">{feedback.captureId}</code> |
            Payout Batch: <code className="font-mono bg-white px-1.5 py-0.5 rounded">{feedback.payoutBatchId}</code>
          </p>
        </div>
      )}

      {/* Milestone Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {milestones.map((m) => (
          <div
            key={m.id}
            className={`bg-white rounded-2xl border p-6 shadow-sm transition space-y-4 ${
              m.status === 'PAID_OUT'
                ? 'border-emerald-300 ring-2 ring-emerald-100'
                : 'border-slate-200 hover:border-slate-300'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-mono font-bold text-slate-400">Milestone #{m.seq}</span>
              <span
                className={`text-xs px-2.5 py-0.5 rounded-full font-bold ${
                  m.status === 'PAID_OUT'
                    ? 'bg-emerald-100 text-emerald-800'
                    : m.status === 'VERIFYING'
                    ? 'bg-amber-100 text-amber-800 animate-pulse'
                    : 'bg-slate-100 text-slate-600'
                }`}
              >
                {m.status}
              </span>
            </div>

            <div>
              <h3 className="font-bold text-slate-900 text-base">{m.title}</h3>
              <p className="text-xs text-slate-500 mt-1">{m.description}</p>
            </div>

            <div className="text-lg font-black text-slate-900 flex items-center space-x-1">
              <DollarSign className="w-4 h-4 text-slate-400" />
              <span>{m.amount.toFixed(2)} USD</span>
            </div>

            <div className="bg-slate-50 p-3 rounded-lg border border-slate-100 space-y-1.5">
              <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                Required Deliverables
              </div>
              <ul className="text-xs text-slate-700 space-y-1">
                {m.deliverables.map((d, i) => (
                  <li key={i} className="flex items-center space-x-1.5">
                    <FileText className="w-3.5 h-3.5 text-slate-400" />
                    <span>{d}</span>
                  </li>
                ))}
              </ul>
            </div>

            {m.status === 'PENDING' && (
              <button
                onClick={() => handleSimulatedSubmit(m)}
                disabled={submitting}
                className="w-full py-2.5 bg-paypal-blue hover:bg-paypal-dark text-white font-bold text-xs rounded-xl transition flex items-center justify-center space-x-2"
              >
                <UploadCloud className="w-4 h-4" />
                <span>{submitting ? 'Uploading & Auditing...' : 'Upload & Submit'}</span>
              </button>
            )}

            {m.status === 'VERIFYING' && (
              <div className="text-center py-2 text-xs font-medium text-amber-700 flex items-center justify-center space-x-1.5">
                <Clock className="w-3.5 h-3.5 animate-spin" />
                <span>AI Vision & KERNEL Audit in Progress...</span>
              </div>
            )}

            {m.status === 'PAID_OUT' && (
              <div className="text-center py-2 text-xs font-bold text-emerald-700 flex items-center justify-center space-x-1.5 bg-emerald-50 rounded-lg">
                <CheckCircle className="w-4 h-4" />
                <span>Funds Deposited in PayPal Balance</span>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
