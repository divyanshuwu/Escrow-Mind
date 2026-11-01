'use client';

import React from 'react';
import Link from 'next/link';
import { Ban, ArrowRight } from 'lucide-react';

export default function PayPalCancelPage() {
  return (
    <div className="max-w-md mx-auto text-center py-16 space-y-6">
      <div className="w-16 h-16 bg-slate-100 text-slate-600 rounded-full flex items-center justify-center mx-auto shadow-sm">
        <Ban className="w-10 h-10" />
      </div>
      <div>
        <h2 className="text-2xl font-black text-slate-900">Authorization Cancelled</h2>
        <p className="text-sm text-slate-500 mt-2">
          The PayPal escrow approval was cancelled. Zero funds were reserved or charged.
        </p>
      </div>
      <Link
        href="/dashboard"
        className="inline-flex items-center space-x-2 px-6 py-3 bg-slate-800 text-white rounded-xl font-bold text-sm hover:bg-slate-900 transition shadow"
      >
        <span>Back to Dashboard</span>
        <ArrowRight className="w-4 h-4" />
      </Link>
    </div>
  );
}
