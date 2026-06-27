import { desc, eq } from 'drizzle-orm';
import { db } from '@/server/db/client';
import { freelancers, payouts } from '@/server/db/schema';
import { AppError } from '@/server/lib/http';
import { inspectPayment, submitSignedTx } from '@/server/stellar/payment';

export const payoutService = {
  /**
   * Execute a REAL on-chain payout: the freelancer signs a payment moving their
   * earnings out to any Stellar address. The server checks the payment leaves
   * the freelancer's own wallet, submits it, and records the confirmed hash.
   */
  async send(
    publicKey: string,
    signedXdr: string,
  ): Promise<typeof payouts.$inferSelect> {
    const freelancer = await db.query.freelancers.findFirst({
      where: eq(freelancers.publicKey, publicKey),
    });
    if (!freelancer) throw new AppError('NOT_FOUND', 'Freelancer not found', 404);

    const details = inspectPayment(signedXdr);
    if (details.source && details.source !== freelancer.walletAddress)
      throw new AppError('INVALID_INPUT', 'Payout must originate from your own wallet', 400);

    const txHash = await submitSignedTx(signedXdr);

    const [payout] = await db
      .insert(payouts)
      .values({
        freelancerId: freelancer.id,
        amount: details.amount,
        asset: details.assetCode,
        destination: details.destination,
        txHash,
        status: 'completed',
      })
      .returning();
    return payout;
  },

  async list(publicKey: string): Promise<(typeof payouts.$inferSelect)[]> {
    const freelancer = await db.query.freelancers.findFirst({
      where: eq(freelancers.publicKey, publicKey),
    });
    if (!freelancer) return [];
    return db.query.payouts.findMany({
      where: eq(payouts.freelancerId, freelancer.id),
      orderBy: [desc(payouts.createdAt)],
    });
  },

  async getById(id: string): Promise<typeof payouts.$inferSelect | undefined> {
    return db.query.payouts.findFirst({
      where: eq(payouts.id, id),
    });
  },
};
