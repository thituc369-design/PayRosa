'use client';

import { CheckCircle, ExternalLink, Loader2, Send } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import {
  buildPaymentXdr,
  explorerTxUrl,
  NotFundedError,
  StrKeyValid,
} from '@/app/lib/stellar';
import { connectWallet, signXdr } from '@/app/lib/wallet';

type Asset = 'XLM' | 'USDC';

interface Payout {
  id: string;
  amount: string;
  asset: Asset;
  destination: string;
  txHash: string;
  createdAt: string;
}

function fmt(amount: string): string {
  if (!amount.includes('.')) return amount;
  return amount.replace(/\.?0+$/, '') || '0';
}

export default function PayoutPage() {
  const [asset, setAsset] = useState<Asset>('XLM');
  const [amount, setAmount] = useState('');
  const [destination, setDestination] = useState('');
  const [busy, setBusy] = useState(false);
  const [history, setHistory] = useState<Payout[]>([]);

  const load = () =>
    fetch('/api/payouts')
      .then((r) => r.json())
      .then((d) => setHistory(d.data?.payouts ?? d.payouts ?? []))
      .catch(() => {});

  useEffect(() => {
    load();
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!StrKeyValid(destination.trim())) {
      toast.error('Enter a valid Stellar address (starts with G, 56 chars)');
      return;
    }
    if (!amount || Number(amount) <= 0) {
      toast.error('Enter an amount greater than zero');
      return;
    }
    setBusy(true);
    try {
      const pk = await connectWallet();
      const xdr = await buildPaymentXdr({
        source: pk,
        destination: destination.trim(),
        asset,
        amount,
        memo: 'PayRosa payout',
      });
      const signed = await signXdr(xdr, pk);
      const res = await fetch('/api/payouts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ signedXdr: signed }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error?.message ?? json.error ?? 'Payout failed');
      toast.success('Payout sent on-chain');
      setAmount('');
      setDestination('');
      load();
    } catch (err) {
      if (err instanceof NotFundedError) {
        toast.error('Your wallet is not funded yet.');
      } else {
        toast.error(err instanceof Error ? err.message : 'Payout failed');
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="max-w-2xl">
      <h1 className="font-heading text-2xl font-bold text-gray-900 mb-1">Payout</h1>
      <p className="text-sm text-gray-500 mb-6">
        Move your earnings out to any Stellar address — an exchange deposit address, a cold wallet,
        or an anchor. Every payout is a real on-chain transfer you can verify.
      </p>

      <div className="rounded-xl border border-gray-200 bg-white p-6 mb-8">
        <form onSubmit={submit} className="space-y-5">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Asset</label>
            <div className="grid grid-cols-2 gap-3">
              {(['XLM', 'USDC'] as Asset[]).map((a) => (
                <button
                  key={a}
                  type="button"
                  onClick={() => setAsset(a)}
                  className={`rounded-lg border px-4 py-2.5 text-sm font-semibold transition-colors ${
                    asset === a
                      ? 'border-teal-500 bg-teal-50 ring-1 ring-teal-500 text-gray-900'
                      : 'border-gray-200 hover:border-gray-300 text-gray-700'
                  }`}
                >
                  {a}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Destination Stellar address
            </label>
            <input
              type="text"
              value={destination}
              onChange={(e) => setDestination(e.target.value)}
              placeholder="G…"
              className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-teal-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Amount ({asset})
            </label>
            <input
              type="text"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="50"
              className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
            />
          </div>

          <button
            type="submit"
            disabled={busy}
            className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-teal-600 px-4 py-3 font-semibold text-white hover:bg-teal-700 disabled:opacity-60 transition-colors"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            {busy ? 'Sending…' : 'Send payout'}
          </button>
        </form>
      </div>

      <h2 className="font-heading text-base font-semibold text-gray-900 mb-3">Payout history</h2>
      {history.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-200 bg-white px-6 py-10 text-center">
          <p className="text-sm text-gray-500">No payouts yet</p>
          <p className="text-xs text-gray-400 mt-1">
            Your on-chain payouts will appear here with their transaction hash.
          </p>
        </div>
      ) : (
        <div className="rounded-xl border border-gray-200 bg-white divide-y divide-gray-100">
          {history.map((p) => (
            <div key={p.id} className="flex items-center justify-between gap-4 px-5 py-3.5">
              <div className="min-w-0">
                <p className="text-sm font-medium text-gray-900">
                  {fmt(p.amount)} {p.asset}
                </p>
                <p className="text-xs text-gray-400 font-mono truncate">
                  to {p.destination.slice(0, 6)}…{p.destination.slice(-4)}
                </p>
              </div>
              <a
                href={explorerTxUrl(p.txHash)}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1 text-xs text-teal-600 hover:underline flex-shrink-0"
              >
                <CheckCircle className="h-3.5 w-3.5" /> tx <ExternalLink className="h-3 w-3" />
              </a>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
