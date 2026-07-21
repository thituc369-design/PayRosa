import { index, integer, pgEnum, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { freelancers } from './freelancers';

export const INVOICE_STATUSES = ['pending', 'paid', 'cancelled'] as const;
export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];
export const invoiceStatusEnum = pgEnum('invoice_status', INVOICE_STATUSES);

export const INVOICE_ASSETS = ['XLM', 'USDC'] as const;
export type InvoiceAsset = (typeof INVOICE_ASSETS)[number];
export const invoiceAssetEnum = pgEnum('invoice_asset', INVOICE_ASSETS);

export const freelancerInvoices = pgTable(
  'freelancer_invoices',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    freelancerId: uuid('freelancer_id')
      .notNull()
      .references(() => freelancers.id, { onDelete: 'cascade' }),
    clientName: text('client_name').notNull(),
    clientEmail: text('client_email'),
    description: text('description').notNull(),
    // Human-readable decimal amount (e.g. "12.5"), up to 7 decimals (stroop precision).
    amount: text('amount').notNull(),
    // Settlement asset. XLM (native) is the default — works for any funded wallet, no trustline.
    asset: invoiceAssetEnum('asset').notNull().default('XLM'),
    status: invoiceStatusEnum('status').notNull().default('pending'),
    memo: text('memo'), // 28-char memo carried on the Stellar payment
    txHash: text('tx_hash'), // release/payout tx hash (escrow -> freelancer)
    depositTxHash: text('deposit_tx_hash'), // escrow deposit (or refund) tx hash
    payerPublicKey: text('payer_public_key'), // wallet that funded the escrow
    paidAt: timestamp('paid_at', { withTimezone: true }),
    version: integer('version').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    freelancerIdx: index('fi_freelancer_idx').on(t.freelancerId),
    statusIdx: index('fi_status_idx').on(t.status),
  }),
);

export type FreelancerInvoice = typeof freelancerInvoices.$inferSelect;
export type NewFreelancerInvoice = typeof freelancerInvoices.$inferInsert;
