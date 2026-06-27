import { index, pgEnum, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { invoiceAssetEnum } from './freelancerInvoices';
import { freelancers } from './freelancers';

export const PAYOUT_STATUSES = ['completed', 'failed'] as const;
export type PayoutStatus = (typeof PAYOUT_STATUSES)[number];
export const payoutStatusEnum = pgEnum('payout_status', PAYOUT_STATUSES);

// A payout is a REAL on-chain transfer of the freelancer's earnings out to any
// Stellar address they control (their exchange/anchor deposit address, a cold
// wallet, etc). Every row is backed by a confirmed Horizon transaction hash.
export const payouts = pgTable(
  'payouts',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    freelancerId: uuid('freelancer_id')
      .notNull()
      .references(() => freelancers.id, { onDelete: 'cascade' }),
    amount: text('amount').notNull(),
    asset: invoiceAssetEnum('asset').notNull().default('XLM'),
    destination: text('destination').notNull(), // Stellar address funds were sent to
    txHash: text('tx_hash').notNull(), // confirmed on-chain hash
    status: payoutStatusEnum('status').notNull().default('completed'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    freelancerIdx: index('payouts_freelancer_idx').on(t.freelancerId),
    statusIdx: index('payouts_status_idx').on(t.status),
  }),
);

export type Payout = typeof payouts.$inferSelect;
export type NewPayout = typeof payouts.$inferInsert;
