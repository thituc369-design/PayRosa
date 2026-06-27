import { eq } from 'drizzle-orm';
import type { NextRequest } from 'next/server';
import { db } from '@/server/db/client';
import { freelancers } from '@/server/db/schema';
import { AppError, ok } from '@/server/lib/http';
import { buildSep7Uri, invoiceService } from '@/server/service/invoice.service';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const invoice = await invoiceService.getById(id);
    if (!invoice) throw new AppError('NOT_FOUND', 'Invoice not found', 404);
    const freelancer = await db.query.freelancers.findFirst({
      where: eq(freelancers.id, invoice.freelancerId),
    });
    const sep7Uri = freelancer
      ? buildSep7Uri({
          destination: freelancer.walletAddress,
          amount: invoice.amount,
          asset: invoice.asset,
          memo: invoice.memo ?? invoice.id.slice(0, 28),
        })
      : null;
    return ok({
      invoice,
      sep7Uri,
      freelancer: freelancer
        ? { displayName: freelancer.displayName, walletAddress: freelancer.walletAddress }
        : null,
    });
  } catch (err) {
    if (err instanceof AppError)
      return Response.json({ error: err.message }, { status: err.status });
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
