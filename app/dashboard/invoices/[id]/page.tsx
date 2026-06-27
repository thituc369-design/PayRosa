'use client';

import { ArrowLeft, CheckCircle, Clock, Copy, ExternalLink, XCircle, Zap } from 'lucide-react';
import Link from 'next/link';
import { use, useEffect, useState } from 'react';
import { toast } from 'sonner';

interface Invoice {
  id: string;
  clientName: string;
  clientEmail?: string;
  description: string;
  amount: string;
  asset: 'XLM' | 'USDC';
  status: 'pending' | 'paid' | 'cancelled';
  memo?: string;
  txHash?: string;
  createdAt: string;
  paidAt?: string;
}

function fmt(amount: string): string {
  if (!amount.includes('.')) return amount;
  return amount.replace(/\.?0+$/, '') || '0';
}

const STATUS_ICONS: Record<string, React.ReactNode> = {
  pending: <Clock className="h-4 w-4 text-amber-500" />,
  paid: <CheckCircle className="h-4 w-4 text-teal-600" />,
  cancelled: <XCircle className="h-4 w-4 text-rose-500" />,
};

export default function InvoiceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [sep7Uri, setSep7Uri] = useState<string | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/invoices/${id}`)
      .then((r) => r.json())
      .then(async (json) => {
        const d = json.data ?? json;
        setInvoice(d.invoice);
        setSep7Uri(d.sep7Uri);
        if (d.sep7Uri) {
          try {
            const QRCode = await import('qrcode');
            const url = await QRCode.toDataURL(d.sep7Uri, { width: 200, margin: 2 });
            setQrDataUrl(url);
          } catch {}
        }
      })
      .finally(() => setLoading(false));
  }, [id]);

  // Auto-refresh while pending so the freelancer sees the payment land live.
  useEffect(() => {
    if (invoice?.status !== 'pending') return;
    const interval = setInterval(async () => {
      const r = await fetch(`/api/invoices/${id}`);
      const json = await r.json();
      const d = json.data ?? json;
      if (d.invoice?.status === 'paid') {
        setInvoice(d.invoice);
        toast.success('Payment received — funds landed in your wallet.', { duration: 6000 });
        clearInterval(interval);
      }
    }, 4000);
    return () => clearInterval(interval);
  }, [id, invoice?.status]);

  const copyPayLink = () => {
    navigator.clipboard.writeText(`${window.location.origin}/pay/${id}`);
    toast.success('Payment link copied');
  };

  if (loading) return <div className="py-16 text-center text-sm text-gray-400">Loading…</div>;
  if (!invoice)
    return <div className="py-16 text-center text-sm text-gray-500">Invoice not found</div>;

  const payUrl = `${typeof window !== 'undefined' ? window.location.origin : ''}/pay/${invoice.id}`;

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

      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="font-heading text-2xl font-bold text-gray-900">{invoice.clientName}</h1>
          <p className="text-sm text-gray-500 mt-1">{invoice.description}</p>
        </div>
        <div className="flex items-center gap-2 rounded-full border border-gray-200 px-3 py-1.5">
          {STATUS_ICONS[invoice.status]}
          <span className="text-sm font-medium capitalize text-gray-700">{invoice.status}</span>
        </div>
      </div>

      {/* Amount */}
      <div className="mb-6 rounded-xl border border-gray-200 bg-white p-6">
        <div className="flex items-center justify-between">
          <span className="text-sm text-gray-500">Amount due</span>
          <span className="font-heading text-3xl font-bold text-gray-900">
            {fmt(invoice.amount)} <span className="text-xl text-gray-400">{invoice.asset}</span>
          </span>
        </div>
        {invoice.paidAt && (
          <div className="mt-3 flex flex-wrap items-center gap-2 text-sm text-teal-600">
            <Zap className="h-3 w-3" />
            Paid {new Date(invoice.paidAt).toLocaleString()}
            {invoice.txHash && (
              <a
                href={`https://stellar.expert/explorer/testnet/tx/${invoice.txHash}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 underline"
              >
                View transaction <ExternalLink className="h-3 w-3" />
              </a>
            )}
          </div>
        )}
      </div>

      {/* Share/pay section — pending only */}
      {invoice.status === 'pending' && (
        <div className="mb-6 rounded-xl border border-teal-200 bg-teal-50 p-6">
          <h2 className="font-heading text-base font-semibold text-teal-900 mb-1">
            Share this invoice
          </h2>
          <p className="text-xs text-teal-700 mb-4">
            Send the link or QR to your client. They connect a wallet and pay on the spot.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            {qrDataUrl && (
              <div className="text-center">
                <p className="text-xs font-medium text-teal-700 mb-2">Scan with a Stellar wallet</p>
                <img
                  src={qrDataUrl}
                  alt="SEP-7 payment QR code"
                  className="mx-auto rounded-lg border-2 border-white"
                />
              </div>
            )}

            <div>
              <p className="text-xs font-medium text-teal-700 mb-2">Payment link</p>
              <div className="rounded-lg bg-white border border-teal-200 p-3 mb-3">
                <p className="text-xs text-gray-600 break-all font-mono">{payUrl}</p>
              </div>
              <button
                type="button"
                onClick={copyPayLink}
                className="w-full flex items-center justify-center gap-2 rounded-lg bg-teal-600 px-3 py-2 text-sm font-semibold text-white hover:bg-teal-700 transition-colors"
              >
                <Copy className="h-4 w-4" />
                Copy payment link
              </button>
              <a
                href={`/pay/${invoice.id}`}
                target="_blank"
                rel="noreferrer"
                className="mt-2 block text-center text-xs text-teal-600 hover:underline"
              >
                Open public pay page
              </a>
            </div>
          </div>

          <div className="mt-4 flex items-center gap-2 text-xs text-teal-600">
            <Zap className="h-3 w-3 animate-pulse" />
            Watching the chain — this page updates the moment it's paid.
          </div>
        </div>
      )}

      {/* Details */}
      <div className="rounded-xl border border-gray-200 bg-white p-6">
        <h2 className="font-heading text-base font-semibold text-gray-900 mb-4">Details</h2>
        <dl className="space-y-3">
          <div className="flex justify-between text-sm">
            <dt className="text-gray-500">Invoice ID</dt>
            <dd className="font-mono text-xs text-gray-700">{invoice.id.slice(0, 18)}…</dd>
          </div>
          <div className="flex justify-between text-sm">
            <dt className="text-gray-500">Memo</dt>
            <dd className="font-mono text-xs text-gray-700">{invoice.memo}</dd>
          </div>
          <div className="flex justify-between text-sm">
            <dt className="text-gray-500">Created</dt>
            <dd className="text-gray-700">{new Date(invoice.createdAt).toLocaleDateString()}</dd>
          </div>
          {invoice.clientEmail && (
            <div className="flex justify-between text-sm">
              <dt className="text-gray-500">Client email</dt>
              <dd className="text-gray-700">{invoice.clientEmail}</dd>
            </div>
          )}
        </dl>
      </div>
    </div>
  );
}
