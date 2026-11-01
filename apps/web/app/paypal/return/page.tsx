'use client';

import React from 'react';
import Link from 'next/link';
import { CheckCircle2, ArrowRight } from 'lucide-react';

export default function PayPalReturnPage() {
  return (
    <div className="max-w-md mx-auto text-center py-16 space-y-6">
      <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto shadow-sm">
        <CheckCircle2 className="w-10 h-10" />
      </div>
      <div>
        <h2 className="text-2xl font-black text-slate-900">Escrow Hold Approved!</h2>
        <p className="text-sm text-slate-500 mt-2">
          Your PayPal authorization has been recorded. Funds are secured on hold without upfront debit.
        </p>
      </div>
      <Link
        href="/dashboard"
        className="inline-flex items-center space-x-2 px-6 py-3 bg-paypal-blue text-white rounded-xl font-bold text-sm hover:bg-paypal-dark transition shadow"
      >
        <span>Return to Dashboard</span>
        <ArrowRight className="w-4 h-4" />
      </Link>
    </div>
  );
}
