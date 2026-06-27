import { index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

export const freelancers = pgTable(
  'freelancers',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    publicKey: text('public_key').notNull().unique(),
    displayName: text('display_name').notNull(),
    email: text('email'),
    walletAddress: text('wallet_address').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    pkIdx: index('freelancers_pk_idx').on(t.publicKey),
  }),
);

export type Freelancer = typeof freelancers.$inferSelect;
export type NewFreelancer = typeof freelancers.$inferInsert;
