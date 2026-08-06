'use client';

import { ArrowLeft, Send } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';

type Asset = 'XLM' | 'USDC';

export default function NewInvoicePage() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [asset, setAsset] = useState<Asset>('XLM');
  const [form, setForm] = useState({
    clientName: '',
    clientEmail: '',
    description: '',
    amount: '',
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.clientName || !form.description || !form.amount) {
      toast.error('Please fill in client, description and amount');
      return;
    }
    const amountNum = Number.parseFloat(form.amount);
    if (Number.isNaN(amountNum) || amountNum <= 0) {
      toast.error('Enter an amount greater than zero');
      return;
    }
    setBusy(true);
    try {
      const res = await fetch('/api/invoices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientName: form.clientName,
          clientEmail: form.clientEmail || undefined,
          description: form.description,
          amount: form.amount,
          asset,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error?.message ?? data.error ?? 'Failed to create invoice');
        return;
      }
      toast.success('Invoice created — share the pay link');
      router.push(`/dashboard/invoices/${data.data?.invoice?.id ?? data.invoice.id}`);
    } catch {
      toast.error('Network error. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="max-w-2xl">
      <div className="mb-6">
        <Link
          href="/dashboard/invoices"
          className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to invoices
        </Link>
      </div>

      <h1 className="font-heading text-2xl font-bold text-gray-900 mb-1">New invoice</h1>
      <p className="text-sm text-gray-500 mb-6">
        Your client pays this on-chain. XLM is selected by default — it needs no trustline.
      </p>

      <div className="rounded-xl border border-gray-200 bg-white p-6">
        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Client name <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              required
              value={form.clientName}
              onChange={(e) => setForm((f) => ({ ...f, clientName: e.target.value }))}
              placeholder="e.g. Acme Studio"
              className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Client email <span className="text-gray-400">(optional)</span>
            </label>
            <input
              type="email"
              value={form.clientEmail}
              onChange={(e) => setForm((f) => ({ ...f, clientEmail: e.target.value }))}
              placeholder="client@example.com"
              className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Description <span className="text-rose-500">*</span>
            </label>
            <textarea
              required
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              placeholder="e.g. Logo design + brand guidelines"
              rows={3}
              className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 resize-none"
            />
          </div>

          {/* Asset selector — XLM pre-selected */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Settlement asset</label>
            <div className="grid grid-cols-2 gap-3">
              {(['XLM', 'USDC'] as Asset[]).map((a) => (
                <button
                  key={a}
                  type="button"
                  onClick={() => setAsset(a)}
                  data-testid={`asset-${a}`}
                  className={`rounded-lg border px-4 py-3 text-left transition-colors ${
                    asset === a
                      ? 'border-teal-500 bg-teal-50 ring-1 ring-teal-500'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <span className="block text-sm font-semibold text-gray-900">{a}</span>
                  <span className="block text-xs text-gray-500">
                    {a === 'XLM' ? 'Native — no trustline' : 'Requires USDC trustline'}
                  </span>
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Amount ({asset}) <span className="text-rose-500">*</span>
            </label>
            <div className="relative">
              <input
                type="text"
                inputMode="decimal"
                required
                value={form.amount}
                onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
                placeholder="100"
                className="w-full pr-16 rounded-lg border border-gray-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-gray-500 bg-gray-100 px-2 py-0.5 rounded">
                {asset}
              </span>
            </div>
          </div>

          <div className="pt-2 flex gap-3">
            <Link
              href="/dashboard/invoices"
              className="flex-1 rounded-lg border border-gray-200 px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 text-center transition-colors"
            >
              Cancel
            </Link>
            <button
              type="submit"
              disabled={busy}
              className="flex-1 inline-flex items-center justify-center gap-2 rounded-lg bg-teal-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-teal-700 disabled:opacity-60 transition-colors"
            >
              <Send className="h-4 w-4" />
              {busy ? 'Creating…' : 'Create invoice'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
