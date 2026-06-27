import { and, desc, eq } from 'drizzle-orm';
import { db } from '@/server/db/client';
import { type InvoiceAsset, freelancerInvoices, freelancers } from '@/server/db/schema';
import { AppError } from '@/server/lib/http';
import {
  getEscrowState,
  refundEscrow,
  releaseEscrow,
  submitSigned,
} from '@/server/stellar/escrow';
import { usdcCode, usdcIssuer } from '@/server/stellar/network';

/** Trim trailing zeros from a decimal amount for display ("12.500" -> "12.5"). */
export function formatAmount(amount: string): string {
  if (!amount.includes('.')) return amount;
  return amount.replace(/\.?0+$/, '') || '0';
}

/** Build a SEP-7 payment URI for an invoice (asset-aware: native vs USDC). */
export function buildSep7Uri(params: {
  destination: string;
  amount: string;
  asset: InvoiceAsset;
  memo: string;
}): string {
  const { destination, amount, asset, memo } = params;
  const parts = [`destination=${destination}`, `amount=${formatAmount(amount)}`];
  if (asset === 'USDC') {
    parts.push(`asset_code=${usdcCode()}`, `asset_issuer=${usdcIssuer()}`);
  }
  parts.push(`memo=${encodeURIComponent(memo)}`, 'memo_type=text');
  return `web+stellar:pay?${parts.join('&')}`;
}

export const invoiceService = {
  async create(params: {
    publicKey: string;
    clientName: string;
    clientEmail?: string;
    description: string;
    amount: string;
    asset: InvoiceAsset;
  }): Promise<typeof freelancerInvoices.$inferSelect> {
    const freelancer = await db.query.freelancers.findFirst({
      where: eq(freelancers.publicKey, params.publicKey),
    });
    if (!freelancer)
      throw new AppError('NOT_FOUND', 'Freelancer profile not found. Connect wallet first.', 404);

    const memo = params.clientName.replace(/[^a-zA-Z0-9 ]/g, '').slice(0, 28) || 'PayRosa';

    const [invoice] = await db
      .insert(freelancerInvoices)
      .values({
        freelancerId: freelancer.id,
        clientName: params.clientName,
        clientEmail: params.clientEmail,
        description: params.description,
        amount: params.amount,
        asset: params.asset,
        memo,
      })
      .returning();
    return invoice;
  },

  async list(publicKey: string): Promise<(typeof freelancerInvoices.$inferSelect)[]> {
    const freelancer = await db.query.freelancers.findFirst({
      where: eq(freelancers.publicKey, publicKey),
    });
    if (!freelancer) return [];
    return db.query.freelancerInvoices.findMany({
      where: eq(freelancerInvoices.freelancerId, freelancer.id),
      orderBy: [desc(freelancerInvoices.createdAt)],
    });
  },

  async getById(id: string): Promise<typeof freelancerInvoices.$inferSelect | undefined> {
    return db.query.freelancerInvoices.findFirst({
      where: eq(freelancerInvoices.id, id),
    });
  },

  /**
   * Settle an invoice THROUGH the on-chain escrow contract.
   *
   * The client signs a `deposit` that locks the amount into the PayRosa escrow
   * contract; the server submits it, confirms the escrow is funded, then triggers
   * `release` (admin-signed) to pay the freelancer instantly. Two real Soroban
   * contract calls, two real tx hashes. No fake states, no simulation.
   */
  async settle(
    invoiceId: string,
    signedDepositXdr: string,
  ): Promise<typeof freelancerInvoices.$inferSelect> {
    const invoice = await db.query.freelancerInvoices.findFirst({
      where: eq(freelancerInvoices.id, invoiceId),
    });
    if (!invoice) throw new AppError('NOT_FOUND', 'Invoice not found', 404);
    if (invoice.status === 'paid') return invoice; // idempotent
    if (invoice.status === 'cancelled')
      throw new AppError('CONFLICT', 'Invoice was cancelled', 409);

    const freelancer = await db.query.freelancers.findFirst({
      where: eq(freelancers.id, invoice.freelancerId),
    });
    if (!freelancer) throw new AppError('NOT_FOUND', 'Freelancer not found', 404);

    // 1. Fund the escrow (client-signed deposit). Tolerate a retry where a prior
    //    deposit already landed but the release step did not.
    let depositTxHash: string | null = null;
    try {
      depositTxHash = await submitSigned(signedDepositXdr);
    } catch (err) {
      const existing = await getEscrowState(invoiceId).catch(() => null);
      if (!existing || existing.status !== 'Funded') throw err;
    }

    // 2. Confirm the escrow is funded with the right beneficiary before payout.
    const escrow = await getEscrowState(invoiceId);
    if (!escrow || escrow.status !== 'Funded')
      throw new AppError('INVALID_INPUT', 'Escrow was not funded', 400);
    if (escrow.freelancer !== freelancer.walletAddress)
      throw new AppError('INVALID_INPUT', 'Escrow beneficiary does not match the invoice', 400);

    // 3. Instant payout — release the escrow to the freelancer (admin-signed).
    const releaseTxHash = await releaseEscrow(invoiceId);

    const [updated] = await db
      .update(freelancerInvoices)
      .set({
        status: 'paid',
        txHash: releaseTxHash,
        depositTxHash,
        payerPublicKey: escrow.client || null,
        paidAt: new Date(),
        updatedAt: new Date(),
        version: invoice.version + 1,
      })
      .where(
        and(eq(freelancerInvoices.id, invoiceId), eq(freelancerInvoices.version, invoice.version)),
      )
      .returning();
    if (!updated) throw new AppError('CONFLICT', 'Concurrent update detected', 409);
    return updated;
  },

  async cancel(
    invoiceId: string,
    publicKey: string,
  ): Promise<typeof freelancerInvoices.$inferSelect> {
    const freelancer = await db.query.freelancers.findFirst({
      where: eq(freelancers.publicKey, publicKey),
    });
    if (!freelancer) throw new AppError('NOT_FOUND', 'Freelancer not found', 404);
    const invoice = await db.query.freelancerInvoices.findFirst({
      where: and(
        eq(freelancerInvoices.id, invoiceId),
        eq(freelancerInvoices.freelancerId, freelancer.id),
      ),
    });
    if (!invoice) throw new AppError('NOT_FOUND', 'Invoice not found', 404);
    if (invoice.status === 'paid')
      throw new AppError('CONFLICT', 'Paid invoices cannot be cancelled', 409);

    // If the client already funded an escrow for this invoice, refund it back to
    // them on-chain (cancel-before-release) before flipping the invoice.
    let refundTxHash: string | null = null;
    const escrow = await getEscrowState(invoiceId).catch(() => null);
    if (escrow?.status === 'Funded') {
      refundTxHash = await refundEscrow(invoiceId);
    }

    const [updated] = await db
      .update(freelancerInvoices)
      .set({
        status: 'cancelled',
        depositTxHash: refundTxHash ?? invoice.depositTxHash,
        updatedAt: new Date(),
      })
      .where(eq(freelancerInvoices.id, invoiceId))
      .returning();
    return updated;
  },
};
