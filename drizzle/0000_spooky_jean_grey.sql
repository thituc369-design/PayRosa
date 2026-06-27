CREATE TYPE "public"."invoice_status" AS ENUM('draft', 'pending', 'paid', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."payout_status" AS ENUM('pending', 'processing', 'completed', 'failed');--> statement-breakpoint
CREATE TABLE "auth_nonces" (
	"nonce" text PRIMARY KEY NOT NULL,
	"public_key" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "freelancer_invoices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"freelancer_id" uuid NOT NULL,
	"client_name" text NOT NULL,
	"client_email" text,
	"description" text NOT NULL,
	"amount_minor" text NOT NULL,
	"currency" text DEFAULT 'USDC' NOT NULL,
	"status" "invoice_status" DEFAULT 'pending' NOT NULL,
	"memo" text,
	"tx_hash" text,
	"paid_at" timestamp with time zone,
	"version" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "freelancers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"public_key" text NOT NULL,
	"display_name" text NOT NULL,
	"email" text,
	"wallet_address" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "freelancers_public_key_unique" UNIQUE("public_key")
);
--> statement-breakpoint
CREATE TABLE "payouts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"freelancer_id" uuid NOT NULL,
	"amount_minor" text NOT NULL,
	"method" text DEFAULT 'bank' NOT NULL,
	"bank_account" text,
	"status" "payout_status" DEFAULT 'pending' NOT NULL,
	"sep24_transaction_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"public_key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "freelancer_invoices" ADD CONSTRAINT "freelancer_invoices_freelancer_id_freelancers_id_fk" FOREIGN KEY ("freelancer_id") REFERENCES "public"."freelancers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payouts" ADD CONSTRAINT "payouts_freelancer_id_freelancers_id_fk" FOREIGN KEY ("freelancer_id") REFERENCES "public"."freelancers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "fi_freelancer_idx" ON "freelancer_invoices" USING btree ("freelancer_id");--> statement-breakpoint
CREATE INDEX "fi_status_idx" ON "freelancer_invoices" USING btree ("status");--> statement-breakpoint
CREATE INDEX "freelancers_pk_idx" ON "freelancers" USING btree ("public_key");--> statement-breakpoint
CREATE INDEX "payouts_freelancer_idx" ON "payouts" USING btree ("freelancer_id");--> statement-breakpoint
CREATE INDEX "payouts_status_idx" ON "payouts" USING btree ("status");