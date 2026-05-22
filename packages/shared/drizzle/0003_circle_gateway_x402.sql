ALTER TABLE "evidence_items" ADD COLUMN IF NOT EXISTS "provider" text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE "evidence_items" ADD COLUMN IF NOT EXISTS "fetched_at" timestamp with time zone DEFAULT now() NOT NULL;
--> statement-breakpoint
ALTER TABLE "evidence_items" ADD COLUMN IF NOT EXISTS "paid" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE "evidence_items" ADD COLUMN IF NOT EXISTS "payment_amount_usdc" numeric(18, 6);
--> statement-breakpoint
ALTER TABLE "evidence_items" ADD COLUMN IF NOT EXISTS "payment_network" text;
--> statement-breakpoint
ALTER TABLE "evidence_items" ADD COLUMN IF NOT EXISTS "payment_ref" text;
--> statement-breakpoint
ALTER TABLE "evidence_items" ADD COLUMN IF NOT EXISTS "tx_hash" text;
--> statement-breakpoint
UPDATE "evidence_items" SET "provider" = CASE WHEN "source_type" = 'polymarket_orderbook' THEN 'polymarket_clob' WHEN "source_type" = 'circle_x402_social' THEN 'legacy_circle_x402' ELSE 'polymarket_gamma' END WHERE "provider" = '';
--> statement-breakpoint
UPDATE "evidence_items" SET "fetched_at" = "captured_at" WHERE "fetched_at" IS NULL;
--> statement-breakpoint
ALTER TABLE "circle_actions" ADD COLUMN IF NOT EXISTS "provider" text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE "circle_actions" ADD COLUMN IF NOT EXISTS "url" text;
--> statement-breakpoint
ALTER TABLE "circle_actions" ADD COLUMN IF NOT EXISTS "amount_usdc" numeric(18, 6) DEFAULT '0' NOT NULL;
--> statement-breakpoint
ALTER TABLE "circle_actions" ADD COLUMN IF NOT EXISTS "payment_ref" text;
--> statement-breakpoint
ALTER TABLE "circle_actions" ADD COLUMN IF NOT EXISTS "related_market_id" text;
--> statement-breakpoint
ALTER TABLE "circle_actions" ADD COLUMN IF NOT EXISTS "related_agent_run_id" integer;
--> statement-breakpoint
ALTER TABLE "circle_actions" ADD COLUMN IF NOT EXISTS "error" text;
--> statement-breakpoint
UPDATE "circle_actions" SET "amount_usdc" = "amount" WHERE "amount_usdc" = 0;
--> statement-breakpoint
UPDATE "circle_actions" SET "payment_ref" = "payment_reference" WHERE "payment_ref" IS NULL AND "payment_reference" IS NOT NULL;
--> statement-breakpoint
UPDATE "circle_actions" SET "related_agent_run_id" = "agent_run_id" WHERE "related_agent_run_id" IS NULL AND "agent_run_id" IS NOT NULL;
--> statement-breakpoint
UPDATE "circle_actions" SET "action_type" = 'arc_bond' WHERE "action_type" = 'bond_call';
--> statement-breakpoint
UPDATE "circle_actions" SET "action_type" = 'thesis_unlock' WHERE "action_type" = 'unlock_thesis';
--> statement-breakpoint
UPDATE "circle_actions" SET "action_type" = 'x402_api_payment' WHERE "action_type" = 'x402_evidence_payment';
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "circle_actions_market_idx" ON "circle_actions" ("related_market_id");
