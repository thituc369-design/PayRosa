import { eq } from 'drizzle-orm';
import { CheckCircle, Clock, ExternalLink, ShieldCheck, XCircle } from 'lucide-react';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { db } from '@/server/db/client';
import { freelancerInvoices, freelancers } from '@/server/db/schema';
import { formatAmount } from '@/server/service/invoice.service';
import { PayWidget } from './PayWidget';

export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const invoice = await db.query.freelancerInvoices.findFirst({
    where: eq(freelancerInvoices.id, id),
  });
  if (!invoice) return { title: 'Invoice not found — PayRosa' };
  return { title: `Pay ${formatAmount(invoice.amount)} ${invoice.asset} — PayRosa` };
}

export default async function PublicPayPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const invoice = await db.query.freelancerInvoices.findFirst({
    where: eq(freelancerInvoices.id, id),
  });
  if (!invoice) notFound();

  const freelancer = await db.query.freelancers.findFirst({
    where: eq(freelancers.id, invoice.freelancerId),
  });

  const isPaid = invoice.status === 'paid';
  const isCancelled = invoice.status === 'cancelled';

  return (
    <div className="min-h-screen bg-gradient-to-br from-teal-50 to-white flex items-center justify-center p-6">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 rounded-full bg-teal-100 px-4 py-2 mb-4">
            <ShieldCheck className="h-3 w-3 text-teal-600" />
            <span className="text-sm font-medium text-teal-700">PayRosa invoice</span>
          </div>
          <h1 className="font-heading text-3xl font-bold text-gray-900">
            {formatAmount(invoice.amount)} {invoice.asset}
          </h1>
          <p className="text-gray-500 mt-1">
            to {freelancer?.displayName ?? 'a PayRosa freelancer'}
          </p>
        </div>

        <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
          <div className="mb-6 space-y-3">
            <div className="flex justify-between text-sm gap-4">
              <span className="text-gray-500 flex-shrink-0">For</span>
              <span className="font-medium text-gray-900 text-right">{invoice.description}</span>
            </div>
            <div className="flex justify-between text-sm gap-4">
              <span className="text-gray-500 flex-shrink-0">Billed to</span>
              <span className="font-medium text-gray-900 text-right">{invoice.clientName}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Status</span>
              <span
                className={`font-medium capitalize flex items-center gap-1 ${
                  isPaid ? 'text-teal-600' : isCancelled ? 'text-rose-500' : 'text-amber-600'
                }`}
              >
                {isPaid ? (
                  <CheckCircle className="h-3 w-3" />
                ) : isCancelled ? (
                  <XCircle className="h-3 w-3" />
                ) : (
                  <Clock className="h-3 w-3" />
                )}
                {invoice.status}
              </span>
            </div>
          </div>

          {!isPaid && !isCancelled && freelancer && (
            <PayWidget
              invoiceId={invoice.id}
              destination={freelancer.walletAddress}
              amount={invoice.amount}
              asset={invoice.asset}
              memo={invoice.memo ?? ''}
            />
          )}

          {isCancelled && (
            <div className="rounded-lg bg-rose-50 border border-rose-200 p-4 text-center text-sm text-rose-600">
              This invoice was cancelled by the freelancer.
            </div>
          )}

          {isPaid && (
            <div className="rounded-lg bg-teal-50 border border-teal-200 p-4 text-center">
              <CheckCircle className="h-8 w-8 text-teal-600 mx-auto mb-2" />
              <p className="font-semibold text-teal-800">Payment complete</p>
              <p className="text-sm text-teal-600 mt-1">
                {formatAmount(invoice.amount)} {invoice.asset} settled on Stellar.
              </p>
              {invoice.txHash && (
                <a
                  href={`https://stellar.expert/explorer/testnet/tx/${invoice.txHash}`}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-2 inline-flex items-center gap-1 text-xs text-teal-600 underline"
                >
                  View transaction <ExternalLink className="h-3 w-3" />
                </a>
              )}
            </div>
          )}
        </div>

        <p className="mt-4 text-center text-xs text-gray-400">
          Settled on Stellar testnet · Funds arrive in ~5 seconds
        </p>
      </div>
    </div>
  );
}
