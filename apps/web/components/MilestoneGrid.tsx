'use client';

import React, { useMemo } from 'react';
import { AgGridReact } from 'ag-grid-react';
import { ColDef, CellValueChangedEvent } from 'ag-grid-community';

export interface GridMilestone {
  id: string;
  seq: number;
  title: string;
  description?: string;
  amount: number;
  status: string;
  deliverables?: string[];
}

interface MilestoneGridProps {
  milestones: GridMilestone[];
  totalBudget: number;
  isEditable: boolean;
  onMilestonesChange?: (updated: GridMilestone[]) => void;
}

export const MilestoneGrid: React.FC<MilestoneGridProps> = ({
  milestones,
  totalBudget,
  isEditable,
  onMilestonesChange,
}) => {
  const currentSum = useMemo(() => {
    return milestones.reduce((acc, m) => acc + Number(m.amount || 0), 0);
  }, [milestones]);

  const remaining = useMemo(() => {
    return Math.round((totalBudget - currentSum) * 100) / 100;
  }, [totalBudget, currentSum]);

  const columnDefs = useMemo<ColDef[]>(() => {
    return [
      { field: 'seq', headerName: '#', width: 70, editable: false },
      { field: 'title', headerName: 'Milestone Title', flex: 1.5, editable: isEditable },
      { field: 'description', headerName: 'Deliverable Scope', flex: 2, editable: isEditable },
      {
        field: 'amount',
        headerName: 'Amount ($)',
        width: 130,
        editable: isEditable,
        valueFormatter: (p) => `$${Number(p.value).toFixed(2)}`,
        cellStyle: { fontWeight: 'bold' },
      },
      {
        field: 'status',
        headerName: 'Status',
        width: 160,
        editable: false,
        cellRenderer: (params: any) => {
          const s = params.value || 'PENDING';
          const colors: Record<string, string> = {
            PENDING: 'bg-slate-100 text-slate-700',
            SUBMITTED: 'bg-blue-100 text-blue-700',
            VERIFYING: 'bg-amber-100 text-amber-800 animate-pulse',
            NEEDS_CLIENT_REVIEW: 'bg-purple-100 text-purple-800 font-semibold',
            VERIFIED: 'bg-teal-100 text-teal-800',
            CAPTURED: 'bg-emerald-100 text-emerald-800',
            PAID_OUT: 'bg-emerald-600 text-white font-bold',
            REJECTED: 'bg-rose-100 text-rose-700',
            DISPUTED: 'bg-red-600 text-white font-bold',
          };
          const badgeClass = colors[s] || 'bg-slate-100 text-slate-600';
          return (
            <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${badgeClass}`}>
              {s.replace(/_/g, ' ')}
            </span>
          );
        },
      },
    ];
  }, [isEditable]);

  const onCellValueChanged = (e: CellValueChangedEvent) => {
    if (!onMilestonesChange) return;
    const updated = milestones.map((m) => {
      if (m.id === e.data.id) {
        return { ...e.data, amount: parseFloat(e.data.amount) || 0 };
      }
      return m;
    });
    onMilestonesChange(updated);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between bg-slate-50 p-3 rounded-lg border border-slate-200">
        <div className="text-sm font-semibold text-slate-700">
          Contract Milestone Allocations
        </div>
        <div className="flex items-center space-x-4 text-xs font-medium">
          <div>
            Total Budget: <span className="font-bold text-slate-900">${totalBudget.toFixed(2)}</span>
          </div>
          <div>
            Allocated: <span className="font-bold text-slate-900">${currentSum.toFixed(2)}</span>
          </div>
          <div className="flex items-center space-x-1.5">
            <span>Remaining:</span>
            <span
              className={`px-2 py-0.5 rounded font-bold ${
                Math.abs(remaining) < 0.01
                  ? 'bg-emerald-100 text-emerald-800'
                  : 'bg-rose-100 text-rose-800'
              }`}
            >
              ${remaining.toFixed(2)}
            </span>
          </div>
        </div>
      </div>

      <div className="ag-theme-alpine w-full h-[240px] rounded-lg overflow-hidden border border-slate-200 shadow-sm">
        <AgGridReact
          rowData={milestones}
          columnDefs={columnDefs}
          onCellValueChanged={onCellValueChanged}
          singleClickEdit={true}
          animateRows={true}
        />
      </div>
    </div>
  );
};
