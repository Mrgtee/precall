ALTER TABLE "calls" ADD COLUMN IF NOT EXISTS "yes_probability_bps" integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
UPDATE "calls" SET "yes_probability_bps" = "agent_probability_bps" WHERE "yes_probability_bps" = 0;
--> statement-breakpoint
ALTER TABLE "calls" ADD COLUMN IF NOT EXISTS "status_reason" text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE "calls" ADD COLUMN IF NOT EXISTS "market_type" text DEFAULT 'strict_yes_no' NOT NULL;
--> statement-breakpoint
ALTER TABLE "calls" ADD COLUMN IF NOT EXISTS "registry_address" text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE "calls" ADD COLUMN IF NOT EXISTS "legacy" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE "evidence_items" ADD COLUMN IF NOT EXISTS "evidence_id" text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE "evidence_items" ADD COLUMN IF NOT EXISTS "source_type" text DEFAULT 'polymarket_market' NOT NULL;
--> statement-breakpoint
ALTER TABLE "evidence_items" ADD COLUMN IF NOT EXISTS "captured_at" timestamp with time zone DEFAULT now() NOT NULL;
--> statement-breakpoint
ALTER TABLE "evidence_items" ADD COLUMN IF NOT EXISTS "metadata" jsonb;
--> statement-breakpoint
ALTER TABLE "agent_runs" ADD COLUMN IF NOT EXISTS "evidence_context" jsonb;
--> statement-breakpoint
ALTER TABLE "agent_runs" ADD COLUMN IF NOT EXISTS "retry_count" integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE "agent_runs" ADD COLUMN IF NOT EXISTS "latency_ms" integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE "follows" ADD COLUMN IF NOT EXISTS "signature" text;
--> statement-breakpoint
ALTER TABLE "follows" ADD COLUMN IF NOT EXISTS "signed_message" text;
--> statement-breakpoint
ALTER TABLE "follows" ADD COLUMN IF NOT EXISTS "signature_status" text DEFAULT 'legacy_unsigned' NOT NULL;
--> statement-breakpoint
ALTER TABLE "feedback" ADD COLUMN IF NOT EXISTS "signature" text;
--> statement-breakpoint
ALTER TABLE "feedback" ADD COLUMN IF NOT EXISTS "signed_message" text;
--> statement-breakpoint
ALTER TABLE "feedback" ADD COLUMN IF NOT EXISTS "signature_status" text DEFAULT 'legacy_unsigned' NOT NULL;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "circle_actions" (
  "id" serial PRIMARY KEY NOT NULL,
  "action_type" text NOT NULL,
  "wallet_address" text DEFAULT '' NOT NULL,
  "amount" numeric(18, 6) DEFAULT '0' NOT NULL,
  "chain" text DEFAULT 'Arc Testnet' NOT NULL,
  "tx_hash" text,
  "payment_reference" text,
  "related_call_id" integer,
  "agent_run_id" integer,
  "status" text DEFAULT 'success' NOT NULL,
  "metadata" jsonb,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "circle_actions_action_type_idx" ON "circle_actions" ("action_type");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "circle_actions_call_idx" ON "circle_actions" ("related_call_id");
--> statement-breakpoint
UPDATE "calls" SET "status" = 'expired', "status_reason" = 'Expired before resolution' WHERE "status" = 'published' AND "expires_at" IS NOT NULL AND "expires_at" <= now();
--> statement-breakpoint
UPDATE "calls" SET "legacy" = true, "status_reason" = CASE WHEN position('Legacy call predates hardened V1 filters' in "status_reason") > 0 THEN "status_reason" ELSE trim(concat_ws('; ', nullif("status_reason", ''), 'Legacy call predates hardened V1 filters')) END WHERE "confidence_bps" < 5200 OR "suggested_size_bps" < 100;
--> statement-breakpoint
UPDATE "calls" SET "legacy" = true, "status" = CASE WHEN "calls"."status" = 'published' THEN 'archived' ELSE "calls"."status" END, "status_reason" = CASE WHEN position('Unsupported V1 market type' in "calls"."status_reason") > 0 THEN "calls"."status_reason" ELSE trim(concat_ws('; ', nullif("calls"."status_reason", ''), 'Unsupported V1 market type')) END FROM "markets" WHERE "calls"."market_id" = "markets"."market_id" AND (jsonb_typeof("markets"."outcomes") <> 'array' OR lower("markets"."outcomes"->>0) <> 'yes' OR lower("markets"."outcomes"->>1) <> 'no');
