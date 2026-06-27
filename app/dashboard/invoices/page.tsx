'use client';

import { ExternalLink, FileText, Plus, Search } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';

interface Invoice {
  id: string;
  clientName: string;
  description: string;
  amount: string;
  asset: 'XLM' | 'USDC';
  status: 'pending' | 'paid' | 'cancelled';
  createdAt: string;
  paidAt?: string;
  txHash?: string;
}

function fmt(amount: string): string {
  if (!amount.includes('.')) return amount;
  return amount.replace(/\.?0+$/, '') || '0';
}

const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-amber-100 text-amber-700',
  paid: 'bg-teal-100 text-teal-700',
  cancelled: 'bg-rose-100 text-rose-600',
};

export default function InvoicesPage() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    fetch('/api/invoices')
      .then((r) => r.json())
      .then((d) => setInvoices(d.data?.invoices ?? d.invoices ?? []))
      .catch(() => toast.error('Failed to load'))
      .finally(() => setLoading(false));
  }, []);

  const filtered = invoices.filter(
    (inv) =>
      inv.clientName.toLowerCase().includes(search.toLowerCase()) ||
      inv.description.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="font-heading text-2xl font-bold text-gray-900">Invoices</h1>
        <Link
          href="/dashboard/invoices/new"
          className="inline-flex items-center gap-2 rounded-lg bg-teal-600 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-700 transition-colors"
        >
          <Plus className="h-4 w-4" />
          New Invoice
        </Link>
      </div>

      {/* Search */}
      <div className="relative mb-6">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
        <input
          type="text"
          placeholder="Search by client or description…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-9 pr-4 py-2.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
        />
      </div>

      <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
        {loading ? (
          <div className="py-16 text-center text-sm text-gray-400">Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="py-16 text-center">
            <FileText className="h-12 w-12 text-gray-300 mx-auto mb-4" />
            <p className="text-sm font-medium text-gray-500">
              {search ? 'No invoices match your search' : 'No invoices created yet'}
            </p>
            <p className="text-xs text-gray-400 mt-1 mb-6">
              {search
                ? 'Try a different search term'
                : 'Create your first invoice and share the pay link'}
            </p>
            {!search && (
              <Link
                href="/dashboard/invoices/new"
                className="inline-flex items-center gap-2 rounded-lg bg-teal-600 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-700"
              >
                <Plus className="h-4 w-4" /> Create Invoice
              </Link>
            )}
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                  Client
                </th>
                <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 hidden sm:table-cell">
                  Description
                </th>
                <th className="px-6 py-3 text-right text-xs font-semibold uppercase tracking-wide text-gray-500">
                  Amount
                </th>
                <th className="px-6 py-3 text-center text-xs font-semibold uppercase tracking-wide text-gray-500">
                  Status
                </th>
                <th className="px-6 py-3 text-right text-xs font-semibold uppercase tracking-wide text-gray-500">
                  Action
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map((inv) => (
                <tr key={inv.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-6 py-4 text-sm font-medium text-gray-900">{inv.clientName}</td>
                  <td className="px-6 py-4 text-sm text-gray-500 hidden sm:table-cell max-w-xs truncate">
                    {inv.description}
                  </td>
                  <td className="px-6 py-4 text-sm font-semibold text-right text-gray-900 whitespace-nowrap">
                    {fmt(inv.amount)} <span className="text-xs text-gray-400">{inv.asset}</span>
                  </td>
                  <td className="px-6 py-4 text-center">
                    <span
                      className={`inline-block text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[inv.status]}`}
                    >
                      {inv.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <Link
                      href={`/dashboard/invoices/${inv.id}`}
                      className="inline-flex items-center gap-1 text-xs text-teal-600 hover:text-teal-700 font-medium"
                    >
                      View <ExternalLink className="h-3 w-3" />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
