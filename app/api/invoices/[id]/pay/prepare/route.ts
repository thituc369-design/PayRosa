import { eq } from 'drizzle-orm';
import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { db } from '@/server/db/client';
import { freelancerInvoices, freelancers } from '@/server/db/schema';
import { AppError, ok } from '@/server/lib/http';
import { buildDepositXdr } from '@/server/stellar/escrow';

export const maxDuration = 60;

// Build the UNSIGNED escrow `deposit` transaction for the payer to sign. No auth
// required: the payer is a client paying a public invoice link. The deposit moves
// the invoice amount into the PayRosa escrow contract (not to anyone directly).
const prepareSchema = z.object({ payer: z.string().min(56).max(56) });

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { payer } = prepareSchema.parse(await req.json());

    const invoice = await db.query.freelancerInvoices.findFirst({
      where: eq(freelancerInvoices.id, id),
    });
    if (!invoice) throw new AppError('NOT_FOUND', 'Invoice not found', 404);
    if (invoice.status !== 'pending')
      throw new AppError('CONFLICT', `Invoice is ${invoice.status}`, 409);

    const freelancer = await db.query.freelancers.findFirst({
      where: eq(freelancers.id, invoice.freelancerId),
    });
    if (!freelancer) throw new AppError('NOT_FOUND', 'Freelancer not found', 404);

    const xdr = await buildDepositXdr({
      invoiceId: invoice.id,
      payer,
      freelancer: freelancer.walletAddress,
      asset: invoice.asset,
      amount: invoice.amount,
    });
    return ok({ xdr });
  } catch (err) {
    if (err instanceof AppError)
      return Response.json({ error: err.message }, { status: err.status });
    if (err instanceof z.ZodError) return Response.json({ error: err.issues }, { status: 400 });
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
