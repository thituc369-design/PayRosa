'use client';

import { Activity, ArrowLeft, FileCheck2, Layers, Users, Wallet, Zap } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';

interface Stats {
  uniqueWallets: number;
  logins: number;
  freelancers: number;
  invoices: number;
  paidInvoices: number;
  payouts: number;
  onChainTransactions: number;
  settledByAsset: { XLM: string; USDC: string };
}

function fmt(amount: string): string {
  const n = Number(amount);
  if (!Number.isFinite(n)) return '0';
  return n % 1 === 0 ? String(n) : n.toFixed(2);
}

export default function StatsPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    fetch('/api/stats')
      .then((r) => r.json())
      .then((d) => setStats(d.data ?? d))
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, []);

  const cards = stats
    ? [
        { icon: Users, label: 'Unique wallets', value: stats.uniqueWallets },
        { icon: Activity, label: 'Wallet sign-ins', value: stats.logins },
        { icon: FileCheck2, label: 'Invoices created', value: stats.invoices },
        { icon: Zap, label: 'Invoices settled', value: stats.paidInvoices },
        { icon: Wallet, label: 'On-chain payouts', value: stats.payouts },
        { icon: Layers, label: 'On-chain transactions', value: stats.onChainTransactions },
      ]
    : [];

  return (
    <div className="min-h-screen bg-gradient-to-br from-teal-50 to-white">
      <header className="border-b border-teal-100 bg-white/80 backdrop-blur-sm">
        <div className="mx-auto max-w-4xl px-6 py-4 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-teal-600 flex items-center justify-center">
              <Zap className="h-4 w-4 text-white" />
            </div>
            <span className="font-heading text-xl font-bold text-teal-900">PayRosa</span>
          </Link>
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-sm text-teal-700 hover:text-teal-900"
          >
            <ArrowLeft className="h-4 w-4" /> Home
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-6 py-12">
        <div className="text-center mb-10">
          <h1 className="font-heading text-3xl font-bold text-teal-900 mb-2">Network stats</h1>
          <p className="text-gray-600">
            Real usage on PayRosa — counted from wallet sessions and on-chain activity. Demo keys
            are excluded.
          </p>
        </div>

        {loading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="rounded-xl border border-gray-200 bg-white p-6 animate-pulse">
                <div className="h-4 w-4 bg-gray-200 rounded mb-3" />
                <div className="h-7 w-12 bg-gray-200 rounded mb-2" />
                <div className="h-3 w-20 bg-gray-100 rounded" />
              </div>
            ))}
          </div>
        ) : error ? (
          <div className="rounded-xl border border-rose-200 bg-rose-50 p-8 text-center text-rose-600">
            Couldn't load stats right now. Please refresh.
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              {cards.map((c) => (
                <div key={c.label} className="rounded-xl border border-gray-200 bg-white p-6">
                  <c.icon className="h-5 w-5 text-teal-600 mb-3" />
                  <p className="font-heading text-3xl font-bold text-gray-900">{c.value}</p>
                  <p className="text-xs text-gray-500 mt-1">{c.label}</p>
                </div>
              ))}
            </div>

            <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="rounded-xl border border-gray-200 bg-white p-6">
                <p className="text-xs text-gray-500 mb-1">Settled volume (XLM)</p>
                <p className="font-heading text-2xl font-bold text-gray-900">
                  {fmt(stats?.settledByAsset.XLM ?? '0')}{' '}
                  <span className="text-base text-gray-400">XLM</span>
                </p>
              </div>
              <div className="rounded-xl border border-gray-200 bg-white p-6">
                <p className="text-xs text-gray-500 mb-1">Settled volume (USDC)</p>
                <p className="font-heading text-2xl font-bold text-gray-900">
                  {fmt(stats?.settledByAsset.USDC ?? '0')}{' '}
                  <span className="text-base text-gray-400">USDC</span>
                </p>
              </div>
            </div>
          </>
        )}

        <p className="mt-10 text-center text-xs text-gray-400">
          Updated live · Stellar testnet
        </p>
      </main>
    </div>
  );
}
