'use client';

import { ArrowRight, CheckCircle, Clock, FileText, Plus, Wallet, Zap } from 'lucide-react';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import {
  buildTrustlineXdr,
  hasUsdcTrustline,
  NotFundedError,
  submitXdr,
} from '@/app/lib/stellar';
import { connectWallet, signXdr } from '@/app/lib/wallet';

interface Invoice {
  id: string;
  clientName: string;
  description: string;
  amount: string;
  asset: 'XLM' | 'USDC';
  status: 'pending' | 'paid' | 'cancelled';
  createdAt: string;
}

const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-amber-100 text-amber-700',
  paid: 'bg-teal-100 text-teal-700',
  cancelled: 'bg-rose-100 text-rose-600',
};

function fmt(amount: string): string {
  if (!amount.includes('.')) return amount;
  return amount.replace(/\.?0+$/, '') || '0';
}

export default function DashboardPage() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [publicKey, setPublicKey] = useState<string | null>(null);
  const [usdcReady, setUsdcReady] = useState<boolean | null>(null);
  const [enabling, setEnabling] = useState(false);
  const [liveEvent, setLiveEvent] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/invoices')
      .then((r) => r.json())
      .then((d) => setInvoices(d.data?.invoices ?? d.invoices ?? []))
      .catch(() => toast.error('Failed to load invoices'))
      .finally(() => setLoading(false));

    fetch('/api/auth/me')
      .then((r) => r.json())
      .then((d) => {
        const pk = d.data?.publicKey ?? d.publicKey;
        if (pk) {
          setPublicKey(pk);
          hasUsdcTrustline(pk)
            .then(setUsdcReady)
            .catch(() => setUsdcReady(false));
        }
      })
      .catch(() => {});
  }, []);

  // Live payment feed from Horizon (SSE).
  useEffect(() => {
    const es = new EventSource('/api/stream');
    es.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);
        if (data.type === 'payments' && data.payments?.length > 0) {
          const latest = data.payments[0];
          const code = latest?.asset_type === 'native' ? 'XLM' : (latest?.asset_code ?? '');
          if (latest?.amount && latest?.to === publicKey) {
            setLiveEvent(`${fmt(latest.amount)} ${code} received`);
          }
        }
      } catch {}
    };
    return () => es.close();
  }, [publicKey]);

  const enableUsdc = useCallback(async () => {
    setEnabling(true);
    try {
      const pk = await connectWallet();
      const xdr = await buildTrustlineXdr(pk);
      const signed = await signXdr(xdr, pk);
      await submitXdr(signed);
      setUsdcReady(true);
      toast.success('USDC enabled — you can now invoice and receive USDC.');
    } catch (err) {
      if (err instanceof NotFundedError) {
        toast.error('Fund your wallet with testnet XLM first, then enable USDC.');
      } else {
        toast.error(err instanceof Error ? err.message : 'Could not enable USDC');
      }
    } finally {
      setEnabling(false);
    }
  }, []);

  const paid = invoices.filter((i) => i.status === 'paid');
  const earnedXlm = paid
    .filter((i) => i.asset === 'XLM')
    .reduce((s, i) => s + Number(i.amount), 0);
  const earnedUsdc = paid
    .filter((i) => i.asset === 'USDC')
    .reduce((s, i) => s + Number(i.amount), 0);
  const pendingCount = invoices.filter((i) => i.status === 'pending').length;

  return (
    <div>
      <div className="mb-8 flex items-center justify-between gap-4">
        <div>
          <h1 className="font-heading text-2xl font-bold text-gray-900">Overview</h1>
          <p className="text-sm text-gray-500 mt-1">Your invoices and on-chain earnings.</p>
        </div>
        <Link
          href="/dashboard/invoices/new"
          className="inline-flex items-center gap-2 rounded-lg bg-teal-600 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-700 transition-colors"
        >
          <Plus className="h-4 w-4" />
          New invoice
        </Link>
      </div>

      {liveEvent && (
        <div className="mb-6 flex items-center gap-3 rounded-xl bg-teal-50 border border-teal-200 px-4 py-3">
          <Zap className="h-4 w-4 text-teal-600 flex-shrink-0" />
          <span className="text-sm font-medium text-teal-800">{liveEvent}</span>
          <span className="ml-auto text-xs text-teal-500">live</span>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <div className="rounded-xl border border-gray-200 bg-white p-6">
          <div className="flex items-center gap-2 mb-2">
            <Wallet className="h-4 w-4 text-teal-600" />
            <span className="text-sm font-medium text-gray-500">Earned (XLM)</span>
          </div>
          <p className="font-heading text-2xl font-bold text-gray-900">{fmt(String(earnedXlm))}</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-6">
          <div className="flex items-center gap-2 mb-2">
            <Wallet className="h-4 w-4 text-teal-600" />
            <span className="text-sm font-medium text-gray-500">Earned (USDC)</span>
          </div>
          <p className="font-heading text-2xl font-bold text-gray-900">{fmt(String(earnedUsdc))}</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-6">
          <div className="flex items-center gap-2 mb-2">
            <Clock className="h-4 w-4 text-amber-500" />
            <span className="text-sm font-medium text-gray-500">Awaiting payment</span>
          </div>
          <p className="font-heading text-2xl font-bold text-gray-900">{pendingCount}</p>
        </div>
      </div>

      {/* USDC receiving setup */}
      {usdcReady === false && (
        <div className="mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border border-teal-200 bg-teal-50 px-5 py-4">
          <div>
            <p className="text-sm font-semibold text-teal-900">Want to invoice in USDC?</p>
            <p className="text-xs text-teal-700 mt-0.5">
              XLM works out of the box. Add a one-time USDC trustline to also receive USDC.
            </p>
          </div>
          <button
            type="button"
            onClick={enableUsdc}
            disabled={enabling}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-teal-600 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-700 disabled:opacity-60 transition-colors"
          >
            {enabling ? 'Enabling…' : 'Enable USDC'}
          </button>
        </div>
      )}
      {usdcReady === true && (
        <div className="mb-6 flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-5 py-3 text-sm text-gray-600">
          <CheckCircle className="h-4 w-4 text-teal-600" />
          Your wallet can receive both XLM and USDC.
        </div>
      )}

      {/* Recent invoices */}
      <div className="rounded-xl border border-gray-200 bg-white">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="font-heading text-base font-semibold text-gray-900">Recent invoices</h2>
          <Link
            href="/dashboard/invoices"
            className="text-sm text-teal-600 hover:text-teal-700 flex items-center gap-1"
          >
            View all <ArrowRight className="h-3 w-3" />
          </Link>
        </div>
        {loading ? (
          <div className="divide-y divide-gray-100">
            {[0, 1, 2].map((i) => (
              <div key={i} className="flex items-center gap-4 px-6 py-4 animate-pulse">
                <div className="flex-1">
                  <div className="h-3 w-32 bg-gray-200 rounded mb-2" />
                  <div className="h-2.5 w-48 bg-gray-100 rounded" />
                </div>
                <div className="h-5 w-16 bg-gray-200 rounded" />
              </div>
            ))}
          </div>
        ) : invoices.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <FileText className="h-10 w-10 text-gray-300 mx-auto mb-3" />
            <p className="text-sm font-medium text-gray-600">No invoices yet</p>
            <p className="text-xs text-gray-400 mt-1 mb-5">
              Create your first invoice and share the pay link with a client.
            </p>
            <Link
              href="/dashboard/invoices/new"
              className="inline-flex items-center gap-2 rounded-lg bg-teal-600 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-700"
            >
              <Plus className="h-4 w-4" /> New invoice
            </Link>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {invoices.slice(0, 5).map((inv) => (
              <Link
                key={inv.id}
                href={`/dashboard/invoices/${inv.id}`}
                className="flex items-center gap-4 px-6 py-4 hover:bg-gray-50 transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{inv.clientName}</p>
                  <p className="text-xs text-gray-500 truncate">{inv.description}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-semibold text-gray-900">
                    {fmt(inv.amount)} {inv.asset}
                  </p>
                  <span
                    className={`inline-block text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[inv.status]}`}
                  >
                    {inv.status}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
