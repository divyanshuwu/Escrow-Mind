'use client';

import React, { useState, useEffect } from 'react';
import { PayPalScriptProvider, PayPalButtons } from '@paypal/react-paypal-js';
import { ShieldCheck, Zap, AlertCircle } from 'lucide-react';

interface PayPalApproveProps {
  projectId: string;
  totalAmount: number;
  onAuthorizationSuccess: (authorizationId: string) => void;
}

export const PayPalApprove: React.FC<PayPalApproveProps> = ({
  projectId,
  totalAmount,
  onAuthorizationSuccess,
}) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080';
  const defaultClientId = process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID || 'AQif9-RhfeD_ngB8mWZRXMUlnDRDPpI_1Uh1iOlKQImtrY4Ocp80D_d8fujmj4Mz5t_6gR_-Z5XmFh0Z';
  const defaultMerchantId = process.env.NEXT_PUBLIC_PAYPAL_MERCHANT_ID || 'U35M58NMFT9N4';

  const [paypalConfig, setPaypalConfig] = useState({
    clientId: defaultClientId === 'test' ? 'sb' : defaultClientId,
    merchantId: defaultMerchantId,
  });

  // Dynamically synchronize PayPal configuration with backend if available
  useEffect(() => {
    let isMounted = true;
    fetch(`${apiUrl}/api/paypal/config`)
      .then((res) => (res.ok ? res.json() : null))
      .then((cfg) => {
        if (!isMounted || !cfg) return;
        setPaypalConfig((prev) => ({
          clientId:
            cfg.clientId && cfg.clientId !== 'test' && !cfg.clientId.startsWith('your_')
              ? cfg.clientId
              : prev.clientId,
          merchantId: cfg.merchantId || prev.merchantId,
        }));
      })
      .catch((err) => {
        console.warn('[PayPalApprove] Backend config fetch skipped, using default config:', err);
      });

    return () => {
      isMounted = false;
    };
  }, [apiUrl]);

  // 1. Live PayPal SDK Order Creation
  const handleCreateOrder = async (data: any, actions: any): Promise<string> => {
    setError(null);
    setLoading(true);

    try {
      // First try backend order creation
      const res = await fetch(`${apiUrl}/api/paypal/orders`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer mock-client-jwt',
        },
        body: JSON.stringify({ projectId }),
      });

      const serverData = await res.json();

      // If backend returned a live PayPal order ID (not a simulated mock), use it
      if (res.ok && serverData.orderId && !serverData.orderId.startsWith('ORDER-')) {
        if (serverData.payeeMerchantId && serverData.payeeMerchantId !== paypalConfig.merchantId) {
          setPaypalConfig((prev) => ({ ...prev, merchantId: serverData.payeeMerchantId }));
        }
        return serverData.orderId;
      }

      // If backend is in mock/sandbox without API keys, use actions.order.create so PayPal sandbox creates a valid order
      if (actions?.order?.create) {
        return await actions.order.create({
          intent: 'AUTHORIZE',
          purchase_units: [
            {
              reference_id: projectId,
              custom_id: projectId,
              description: 'EscrowMind project escrow hold',
              amount: {
                currency_code: 'USD',
                value: totalAmount.toFixed(2),
              },
              payee: paypalConfig.merchantId
                ? {
                    merchant_id: paypalConfig.merchantId,
                  }
                : undefined,
            },
          ],
        });
      }

      return serverData.orderId;
    } catch (err: any) {
      setError(err.message || 'Failed to initiate PayPal order');
      setLoading(false);
      throw err;
    }
  };

  // 2. Handle PayPal Approval from Popup
  const handleApprove = async (data: any) => {
    try {
      const res = await fetch(`${apiUrl}/api/paypal/authorize`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer mock-client-jwt',
        },
        body: JSON.stringify({
          projectId,
          orderId: data.orderID,
        }),
      });

      const result = await res.json();
      if (!res.ok) {
        throw new Error(result.error?.message || 'Failed to authorize hold');
      }

      onAuthorizationSuccess(result.authorizationId || data.orderID);
    } catch (err: any) {
      setError(err.message || 'Authorization failed');
    } finally {
      setLoading(false);
    }
  };

  // 3. Instant 1-Click Demo Approval (Zero-Dependency fallback)
  const handleInstantDemoApprove = async () => {
    setLoading(true);
    setError(null);
    try {
      const mockOrderId = `DEMO-ORDER-${Date.now().toString(36).toUpperCase()}`;
      const res = await fetch(`${apiUrl}/api/paypal/authorize`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer mock-client-jwt',
        },
        body: JSON.stringify({
          projectId,
          orderId: mockOrderId,
        }),
      });

      const result = await res.json();
      if (!res.ok) {
        throw new Error(result.error?.message || 'Demo authorization failed');
      }

      onAuthorizationSuccess(result.authorizationId || `AUTH-${mockOrderId}`);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-md space-y-5">
      <div className="flex items-center justify-between border-b pb-4">
        <div>
          <h4 className="font-extrabold text-slate-900 text-lg flex items-center space-x-2">
            <ShieldCheck className="w-5 h-5 text-paypal-blue" />
            <span>Authorize Escrow Funds</span>
          </h4>
          <p className="text-xs text-slate-500 mt-0.5">
            Funds are reserved on hold via PayPal <code className="font-mono bg-slate-100 px-1 rounded">intent: AUTHORIZE</code>. Zero upfront debit.
          </p>
        </div>
        <div className="text-right">
          <span className="text-xs text-slate-400 font-semibold uppercase tracking-wider">Escrow Total</span>
          <div className="text-2xl font-black text-paypal-blue">${totalAmount.toFixed(2)}</div>
        </div>
      </div>

      {error && (
        <div className="bg-rose-50 border border-rose-200 text-rose-800 text-xs p-3.5 rounded-xl flex items-center space-x-2">
          <AlertCircle className="w-4 h-4 text-rose-600 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Option A: 1-Click Instant Demo Authorization */}
      <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 p-4 rounded-xl space-y-2.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Zap className="w-4 h-4 text-paypal-blue font-bold" />
            <span className="font-bold text-xs text-slate-900">Instant Demo Mode (Recommended for Testing)</span>
          </div>
          <span className="text-[10px] bg-blue-100 text-blue-800 font-bold px-2 py-0.5 rounded-full">
            Zero-Login Sandbox
          </span>
        </div>
        <p className="text-[11px] text-slate-600">
          Simulate a successful PayPal authorization hold in 1 click without needing sandbox credentials.
        </p>
        <button
          onClick={handleInstantDemoApprove}
          disabled={loading}
          className="w-full py-2.5 bg-paypal-blue hover:bg-paypal-dark text-white font-bold text-xs rounded-lg transition shadow-sm flex items-center justify-center space-x-2 disabled:opacity-50"
        >
          <ShieldCheck className="w-4 h-4" />
          <span>{loading ? 'Authorizing Hold...' : `⚡ Simulate PayPal Authorize ($${totalAmount.toFixed(2)})`}</span>
        </button>
      </div>

      {/* Divider */}
      <div className="relative flex py-1 items-center">
        <div className="flex-grow border-t border-slate-200"></div>
        <span className="flex-shrink mx-4 text-[11px] font-bold text-slate-400 uppercase">Or Real PayPal Sandbox Popup</span>
        <div className="flex-grow border-t border-slate-200"></div>
      </div>

      {/* Option B: Real PayPal JS SDK Popup */}
      <PayPalScriptProvider
        key={`${paypalConfig.clientId}-${paypalConfig.merchantId}`}
        options={{
          clientId: paypalConfig.clientId,
          merchantId: paypalConfig.merchantId,
          intent: 'authorize',
          currency: 'USD',
        }}
      >
        <div className="max-w-md mx-auto">
          <PayPalButtons
            style={{ layout: 'vertical', color: 'gold', shape: 'rect', label: 'pay' }}
            disabled={loading}
            createOrder={handleCreateOrder}
            onApprove={handleApprove}
            onError={(err) => {
              console.warn('[PayPal SDK Error]', err);
              setError('PayPal Sandbox popup encountered an error. You can use the "⚡ Simulate PayPal Authorize" button above to proceed.');
            }}
          />
        </div>
      </PayPalScriptProvider>
    </div>
  );
};