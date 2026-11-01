'use client';

import React from 'react';
import { CheckCircle2, ShieldCheck, DollarSign, Ban, RefreshCw, AlertCircle } from 'lucide-react';

export interface LedgerEvent {
  id: number;
  project_id: string;
  milestone_id?: string;
  kind: 'AUTHORIZE' | 'CAPTURE' | 'PAYOUT' | 'FEE' | 'VOID' | 'REFUND' | 'REAUTHORIZE';
  amount: number;
  paypal_id: string;
  created_at: string;
}

interface TimelineProps {
  entries: LedgerEvent[];
}

export const Timeline: React.FC<TimelineProps> = ({ entries }) => {
  if (!entries || entries.length === 0) {
    return (
      <div className="text-center py-8 text-slate-400 text-xs bg-slate-50 rounded-xl border border-dashed border-slate-200">
        No money ledger entries yet. Authorized transactions will appear here.
      </div>
    );
  }

  const getEventIcon = (kind: LedgerEvent['kind']) => {
    switch (kind) {
      case 'AUTHORIZE':
        return <ShieldCheck className="w-4 h-4 text-paypal-blue" />;
      case 'CAPTURE':
        return <CheckCircle2 className="w-4 h-4 text-emerald-600" />;
      case 'PAYOUT':
        return <DollarSign className="w-4 h-4 text-emerald-700" />;
      case 'VOID':
        return <Ban className="w-4 h-4 text-slate-500" />;
      case 'REFUND':
        return <AlertCircle className="w-4 h-4 text-rose-600" />;
      case 'REAUTHORIZE':
        return <RefreshCw className="w-4 h-4 text-blue-500" />;
      default:
        return <CheckCircle2 className="w-4 h-4 text-slate-400" />;
    }
  };

  return (
    <div className="flow-root">
      <ul className="-mb-8">
        {entries.map((event, idx) => (
          <li key={event.id || idx}>
            <div className="relative pb-8">
              {idx !== entries.length - 1 ? (
                <span
                  className="absolute left-4 top-4 -ml-px h-full w-0.5 bg-slate-200"
                  aria-hidden="true"
                />
              ) : null}
              <div className="relative flex space-x-3 items-start">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 ring-4 ring-white border border-slate-200 shadow-sm">
                  {getEventIcon(event.kind)}
                </div>
                <div className="flex min-w-0 flex-1 justify-between space-x-4 pt-1.5">
                  <div>
                    <p className="text-xs font-bold text-slate-900">
                      {event.kind === 'AUTHORIZE' && 'Funds Escrow Authorized'}
                      {event.kind === 'CAPTURE' && `Partial Capture Released: $${Number(event.amount).toFixed(2)}`}
                      {event.kind === 'PAYOUT' && `Instant Freelancer Payout: $${Number(event.amount).toFixed(2)}`}
                      {event.kind === 'VOID' && 'Authorization Remainder Voided'}
                      {event.kind === 'REFUND' && `Milestone Refund Issued: $${Number(event.amount).toFixed(2)}`}
                      {event.kind === 'REAUTHORIZE' && 'Authorization Renewed for 29-day validity'}
                    </p>
                    <div className="text-[11px] font-mono text-slate-500 mt-0.5 flex items-center space-x-1">
                      <span>PayPal ID:</span>
                      <span className="font-semibold text-slate-700 bg-slate-100 px-1.5 py-0.5 rounded">
                        {event.paypal_id}
                      </span>
                    </div>
                  </div>
                  <div className="whitespace-nowrap text-right text-[11px] text-slate-400 font-mono">
                    {new Date(event.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </div>
                </div>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
};
