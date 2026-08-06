import { and, count, countDistinct, eq, isNotNull, notInArray, sql } from 'drizzle-orm';
import { db } from '@/server/db/client';
import { freelancerInvoices, freelancers, payouts, sessions } from '@/server/db/schema';

// Wallet keys that were ever used for seeding/demos are excluded from the public
// interaction counts so /stats only reflects real users and real flows.
const DEMO_KEYS = ['GDQP2KPQGKIHYJGXNUIYOMHARUARCA7DJT5FO2FFOOKY3B2WSQHG4W37'];

export type UsageStats = {
  uniqueWallets: number;
  logins: number;
  freelancers: number;
  invoices: number;
  paidInvoices: number;
  payouts: number;
  onChainTransactions: number;
  settledByAsset: { XLM: string; USDC: string };
};

export const statsService = {
  async usage(): Promise<UsageStats> {
    const notDemo = notInArray(sessions.publicKey, DEMO_KEYS);

    const [walletRow] = await db
      .select({ n: countDistinct(sessions.publicKey) })
      .from(sessions)
      .where(notDemo);

    const [loginRow] = await db.select({ n: count() }).from(sessions).where(notDemo);

    const [flRow] = await db
      .select({ n: count() })
      .from(freelancers)
      .where(notInArray(freelancers.publicKey, DEMO_KEYS));

    const [invRow] = await db
      .select({ n: count() })
      .from(freelancerInvoices)
      .innerJoin(freelancers, eq(freelancerInvoices.freelancerId, freelancers.id))
      .where(notInArray(freelancers.publicKey, DEMO_KEYS));

    const [paidRow] = await db
      .select({ n: count() })
      .from(freelancerInvoices)
      .innerJoin(freelancers, eq(freelancerInvoices.freelancerId, freelancers.id))
      .where(
        and(
          eq(freelancerInvoices.status, 'paid'),
          isNotNull(freelancerInvoices.txHash),
          notInArray(freelancers.publicKey, DEMO_KEYS),
        ),
      );

    const [payoutRow] = await db
      .select({ n: count() })
      .from(payouts)
      .innerJoin(freelancers, eq(payouts.freelancerId, freelancers.id))
      .where(notInArray(freelancers.publicKey, DEMO_KEYS));

    // Real on-chain settlement volume, grouped by asset.
    const settledRows = await db
      .select({
        asset: freelancerInvoices.asset,
        total: sql<string>`coalesce(sum(${freelancerInvoices.amount}::numeric), 0)`,
      })
      .from(freelancerInvoices)
      .innerJoin(freelancers, eq(freelancerInvoices.freelancerId, freelancers.id))
      .where(
        and(
          eq(freelancerInvoices.status, 'paid'),
          notInArray(freelancers.publicKey, DEMO_KEYS),
        ),
      )
      .groupBy(freelancerInvoices.asset);

    const settledByAsset = { XLM: '0', USDC: '0' };
    for (const r of settledRows) {
      settledByAsset[r.asset] = String(r.total ?? '0');
    }

    const paidInvoices = Number(paidRow?.n ?? 0);
    const payoutCount = Number(payoutRow?.n ?? 0);

    return {
      uniqueWallets: Number(walletRow?.n ?? 0),
      logins: Number(loginRow?.n ?? 0),
      freelancers: Number(flRow?.n ?? 0),
      invoices: Number(invRow?.n ?? 0),
      paidInvoices,
      payouts: payoutCount,
      onChainTransactions: paidInvoices + payoutCount,
      settledByAsset,
    };
  },
};
