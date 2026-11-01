import './globals.css';
import type { Metadata } from 'next';
import React from 'react';

export const metadata: Metadata = {
  title: 'EscrowMind | AI Freelance Escrow Agent',
  description: 'Autonomous micro-escrow powered by PayPal and multimodal AI verification.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="antialiased">
        <header className="border-b bg-white/80 backdrop-blur sticky top-0 z-50">
          <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="w-9 h-9 rounded-lg bg-paypal-blue flex items-center justify-center text-white font-bold text-lg shadow-sm">
                EM
              </div>
              <span className="font-extrabold text-xl text-slate-900 tracking-tight">
                Escrow<span className="text-paypal-light">Mind</span>
              </span>
              <span className="text-xs bg-paypal-gold/30 text-amber-900 font-semibold px-2 py-0.5 rounded-full border border-amber-300">
                PayPal AI Hackathon 2026
              </span>
            </div>
            <nav className="flex items-center space-x-6 text-sm font-medium text-slate-600">
              <a href="/dashboard" className="hover:text-paypal-blue transition">Client Dashboard</a>
              <a href="/workspace" className="hover:text-paypal-blue transition">Freelancer Workspace</a>
              <span className="text-xs bg-emerald-50 text-emerald-700 px-2.5 py-1 rounded-full border border-emerald-200">
                Sandbox Mode
              </span>
            </nav>
          </div>
        </header>
        <main className="max-w-7xl mx-auto px-4 py-8">
          {children}
        </main>
      </body>
    </html>
  );
}
