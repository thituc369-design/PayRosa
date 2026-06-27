import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { AppError, ok } from '@/server/lib/http';
import { invoiceService } from '@/server/service/invoice.service';

export const maxDuration = 60;

// Settle an invoice through the on-chain escrow contract. The body carries the
// client-signed `deposit` transaction; the server submits it, confirms the
// escrow funded, then releases the payout to the freelancer. No auth required:
// the payer is a client paying a public invoice link.
const paySchema = z.object({ signedXdr: z.string().min(1) });

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { signedXdr } = paySchema.parse(await req.json());
    const invoice = await invoiceService.settle(id, signedXdr);
    return ok({ invoice, txHash: invoice.txHash });
  } catch (err) {
    if (err instanceof AppError)
      return Response.json({ error: err.message }, { status: err.status });
    if (err instanceof z.ZodError) return Response.json({ error: err.issues }, { status: 400 });
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
