CREATE TABLE IF NOT EXISTS "circle_actions" (
  "id" serial PRIMARY KEY NOT NULL,
  "action_type" text NOT NULL,
  "provider" text DEFAULT '' NOT NULL,
  "url" text,
  "wallet_address" text DEFAULT '' NOT NULL,
  "amount" numeric(18, 6) DEFAULT '0' NOT NULL,
  "amount_usdc" numeric(18, 6) DEFAULT '0' NOT NULL,
  "chain" text DEFAULT 'Arc Testnet' NOT NULL,
  "tx_hash" text,
  "payment_reference" text,
  "payment_ref" text,
  "related_market_id" text,
  "related_call_id" integer,
  "agent_run_id" integer,
  "related_agent_run_id" integer,
  "status" text DEFAULT 'success' NOT NULL,
  "error" text,
  "metadata" jsonb,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "circle_actions" ADD COLUMN IF NOT EXISTS "action_type" text;
--> statement-breakpoint
UPDATE "circle_actions" SET "action_type" = 'legacy_unknown' WHERE "action_type" IS NULL;
--> statement-breakpoint
ALTER TABLE "circle_actions" ALTER COLUMN "action_type" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "circle_actions" ADD COLUMN IF NOT EXISTS "amount" numeric(18, 6) DEFAULT '0' NOT NULL;
--> statement-breakpoint
ALTER TABLE "circle_actions" ALTER COLUMN "amount" TYPE numeric(18, 6) USING coalesce("amount", 0)::numeric(18, 6);
--> statement-breakpoint
UPDATE "circle_actions" SET "amount" = 0 WHERE "amount" IS NULL;
--> statement-breakpoint
ALTER TABLE "circle_actions" ALTER COLUMN "amount" SET DEFAULT '0';
--> statement-breakpoint
ALTER TABLE "circle_actions" ALTER COLUMN "amount" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "circle_actions" ADD COLUMN IF NOT EXISTS "amount_usdc" numeric(18, 6) DEFAULT '0' NOT NULL;
--> statement-breakpoint
ALTER TABLE "circle_actions" ALTER COLUMN "amount_usdc" TYPE numeric(18, 6) USING coalesce("amount_usdc", 0)::numeric(18, 6);
--> statement-breakpoint
UPDATE "circle_actions" SET "amount_usdc" = coalesce(nullif("amount_usdc", 0), "amount", 0) WHERE "amount_usdc" IS NULL OR ("amount_usdc" = 0 AND "amount" <> 0);
--> statement-breakpoint
ALTER TABLE "circle_actions" ALTER COLUMN "amount_usdc" SET DEFAULT '0';
--> statement-breakpoint
ALTER TABLE "circle_actions" ALTER COLUMN "amount_usdc" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "circle_actions" ADD COLUMN IF NOT EXISTS "status" text DEFAULT 'success' NOT NULL;
--> statement-breakpoint
UPDATE "circle_actions" SET "status" = 'success' WHERE "status" IS NULL;
--> statement-breakpoint
ALTER TABLE "circle_actions" ALTER COLUMN "status" SET DEFAULT 'success';
--> statement-breakpoint
ALTER TABLE "circle_actions" ALTER COLUMN "status" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "circle_actions" ADD COLUMN IF NOT EXISTS "created_at" timestamp with time zone DEFAULT now() NOT NULL;
--> statement-breakpoint
UPDATE "circle_actions" SET "created_at" = now() WHERE "created_at" IS NULL;
--> statement-breakpoint
ALTER TABLE "circle_actions" ALTER COLUMN "created_at" SET DEFAULT now();
--> statement-breakpoint
ALTER TABLE "circle_actions" ALTER COLUMN "created_at" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "circle_actions" ADD COLUMN IF NOT EXISTS "provider" text DEFAULT '' NOT NULL;
--> statement-breakpoint
UPDATE "circle_actions" SET "provider" = '' WHERE "provider" IS NULL;
--> statement-breakpoint
ALTER TABLE "circle_actions" ALTER COLUMN "provider" SET DEFAULT '';
--> statement-breakpoint
ALTER TABLE "circle_actions" ALTER COLUMN "provider" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "circle_actions" ADD COLUMN IF NOT EXISTS "url" text;
--> statement-breakpoint
ALTER TABLE "circle_actions" ADD COLUMN IF NOT EXISTS "wallet_address" text DEFAULT '' NOT NULL;
--> statement-breakpoint
UPDATE "circle_actions" SET "wallet_address" = '' WHERE "wallet_address" IS NULL;
--> statement-breakpoint
ALTER TABLE "circle_actions" ALTER COLUMN "wallet_address" SET DEFAULT '';
--> statement-breakpoint
ALTER TABLE "circle_actions" ALTER COLUMN "wallet_address" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "circle_actions" ADD COLUMN IF NOT EXISTS "chain" text DEFAULT 'Arc Testnet' NOT NULL;
--> statement-breakpoint
UPDATE "circle_actions" SET "chain" = 'Arc Testnet' WHERE "chain" IS NULL;
--> statement-breakpoint
ALTER TABLE "circle_actions" ALTER COLUMN "chain" SET DEFAULT 'Arc Testnet';
--> statement-breakpoint
ALTER TABLE "circle_actions" ALTER COLUMN "chain" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "circle_actions" ADD COLUMN IF NOT EXISTS "tx_hash" text;
--> statement-breakpoint
ALTER TABLE "circle_actions" ADD COLUMN IF NOT EXISTS "payment_reference" text;
--> statement-breakpoint
ALTER TABLE "circle_actions" ADD COLUMN IF NOT EXISTS "payment_ref" text;
--> statement-breakpoint
ALTER TABLE "circle_actions" ADD COLUMN IF NOT EXISTS "related_market_id" text;
--> statement-breakpoint
ALTER TABLE "circle_actions" ADD COLUMN IF NOT EXISTS "related_call_id" integer;
--> statement-breakpoint
ALTER TABLE "circle_actions" ADD COLUMN IF NOT EXISTS "agent_run_id" integer;
--> statement-breakpoint
ALTER TABLE "circle_actions" ADD COLUMN IF NOT EXISTS "related_agent_run_id" integer;
--> statement-breakpoint
ALTER TABLE "circle_actions" ADD COLUMN IF NOT EXISTS "error" text;
--> statement-breakpoint
ALTER TABLE "circle_actions" ADD COLUMN IF NOT EXISTS "metadata" jsonb;
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
CREATE INDEX IF NOT EXISTS "circle_actions_action_type_idx" ON "circle_actions" ("action_type");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "circle_actions_call_idx" ON "circle_actions" ("related_call_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "circle_actions_market_idx" ON "circle_actions" ("related_market_id");
