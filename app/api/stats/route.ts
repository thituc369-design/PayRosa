import { AppError, ok } from '@/server/lib/http';
import { statsService } from '@/server/service/stats.service';

export const dynamic = 'force-dynamic';

// Public, read-only usage metrics: real wallets, logins, invoices, on-chain txs.
export async function GET() {
  try {
    const stats = await statsService.usage();
    return ok(stats);
  } catch (err) {
    if (err instanceof AppError)
      return Response.json({ error: err.message }, { status: err.status });
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
