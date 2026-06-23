CREATE TABLE IF NOT EXISTS "agent_configs" (
  "id" serial PRIMARY KEY NOT NULL,
  "agent_id" integer NOT NULL,
  "slug" text NOT NULL,
  "tagline" text DEFAULT '' NOT NULL,
  "description" text DEFAULT '' NOT NULL,
  "category_scope" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "strategy_mode" text DEFAULT 'hit_rate' NOT NULL,
  "risk_profile" text DEFAULT 'balanced' NOT NULL,
  "unlock_price_usdc" numeric(18, 6) DEFAULT '0.05' NOT NULL,
  "daily_x402_budget_usdc" numeric(18, 6) DEFAULT '0.10' NOT NULL,
  "max_x402_payment_usdc" numeric(18, 6) DEFAULT '0.005' NOT NULL,
  "max_calls_per_run" integer DEFAULT 3 NOT NULL,
  "require_x402" boolean DEFAULT true NOT NULL,
  "review_status" text DEFAULT 'pending_review' NOT NULL,
  "visibility" text DEFAULT 'public' NOT NULL,
  "agent_share_bps" integer DEFAULT 7000 NOT NULL,
  "platform_share_bps" integer DEFAULT 3000 NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "agent_configs_agent_id_unique" UNIQUE("agent_id"),
  CONSTRAINT "agent_configs_slug_unique" UNIQUE("slug")
);

CREATE UNIQUE INDEX IF NOT EXISTS "agent_configs_slug_idx" ON "agent_configs" USING btree ("slug");
CREATE INDEX IF NOT EXISTS "agent_configs_review_status_idx" ON "agent_configs" USING btree ("review_status");
CREATE INDEX IF NOT EXISTS "agent_configs_visibility_idx" ON "agent_configs" USING btree ("visibility");

CREATE TABLE IF NOT EXISTS "agent_revenue_events" (
  "id" serial PRIMARY KEY NOT NULL,
  "agent_id" integer NOT NULL,
  "source_type" text NOT NULL,
  "source_id" integer NOT NULL,
  "unlocker_wallet" text NOT NULL,
  "gross_amount_usdc" numeric(18, 6) NOT NULL,
  "agent_share_usdc" numeric(18, 6) NOT NULL,
  "platform_share_usdc" numeric(18, 6) NOT NULL,
  "tx_hash" text,
  "status" text DEFAULT 'accrued' NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "agent_revenue_events_source_unlocker_idx" ON "agent_revenue_events" USING btree ("source_type", "source_id", "unlocker_wallet");
CREATE INDEX IF NOT EXISTS "agent_revenue_events_agent_idx" ON "agent_revenue_events" USING btree ("agent_id");
CREATE INDEX IF NOT EXISTS "agent_revenue_events_status_idx" ON "agent_revenue_events" USING btree ("status");
CREATE INDEX IF NOT EXISTS "agent_revenue_events_created_at_idx" ON "agent_revenue_events" USING btree ("created_at");

CREATE TABLE IF NOT EXISTS "agent_payouts" (
  "id" serial PRIMARY KEY NOT NULL,
  "agent_id" integer NOT NULL,
  "destination_wallet" text NOT NULL,
  "amount_usdc" numeric(18, 6) NOT NULL,
  "status" text DEFAULT 'pending' NOT NULL,
  "tx_hash" text,
  "notes" text DEFAULT '' NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "agent_payouts_agent_idx" ON "agent_payouts" USING btree ("agent_id");
CREATE INDEX IF NOT EXISTS "agent_payouts_status_idx" ON "agent_payouts" USING btree ("status");
CREATE INDEX IF NOT EXISTS "agent_payouts_created_at_idx" ON "agent_payouts" USING btree ("created_at");

INSERT INTO "agents" ("name", "role", "owner_wallet", "metadata_uri", "active")
SELECT 'Precall Council', 'Five-role reasoning council: MacroScout, NewsHawk, CrowdPulse, BookWatcher, and Skeptic run as separate model calls.', '0x0000000000000000000000000000000000000000', 'https://precall.arena/agents/precall-council', true
WHERE NOT EXISTS (
  SELECT 1 FROM "agents" WHERE "name" = 'Precall Council'
);

INSERT INTO "agents" ("name", "role", "owner_wallet", "metadata_uri", "active")
SELECT 'Precall Sports Council', 'First-party hosted sports council that publishes Sports Live Calls across approved sports markets.', '0x0000000000000000000000000000000000000000', 'https://precall.arena/agents/precall-sports-council', true
WHERE NOT EXISTS (
  SELECT 1 FROM "agents" WHERE "name" = 'Precall Sports Council'
);

INSERT INTO "agent_configs" (
  "agent_id",
  "slug",
  "tagline",
  "description",
  "category_scope",
  "strategy_mode",
  "risk_profile",
  "unlock_price_usdc",
  "daily_x402_budget_usdc",
  "max_x402_payment_usdc",
  "max_calls_per_run",
  "require_x402",
  "review_status",
  "visibility",
  "agent_share_bps",
  "platform_share_bps"
)
SELECT
  a."id",
  'precall-council',
  'First-party bonded call desk',
  'Platform-owned first-party agent for strict YES/NO bonded Arc calls.',
  '[]'::jsonb,
  'balanced',
  'balanced',
  '0.05',
  '0.10',
  '0.005',
  2,
  true,
  'active',
  'public',
  7000,
  3000
FROM "agents" a
WHERE a."name" = 'Precall Council'
  AND NOT EXISTS (
    SELECT 1 FROM "agent_configs" c WHERE c."agent_id" = a."id"
  );

INSERT INTO "agent_configs" (
  "agent_id",
  "slug",
  "tagline",
  "description",
  "category_scope",
  "strategy_mode",
  "risk_profile",
  "unlock_price_usdc",
  "daily_x402_budget_usdc",
  "max_x402_payment_usdc",
  "max_calls_per_run",
  "require_x402",
  "review_status",
  "visibility",
  "agent_share_bps",
  "platform_share_bps"
)
SELECT
  a."id",
  'precall-sports-council',
  'First-party sports call desk',
  'Platform-owned first-party sports agent for hosted Sports Live Calls.',
  '["soccer","nba","mlb","nhl","ufc","football","esports","tennis","cricket"]'::jsonb,
  'hit_rate',
  'balanced',
  '0.05',
  '0.10',
  '0.005',
  8,
  true,
  'active',
  'public',
  7000,
  3000
FROM "agents" a
WHERE a."name" = 'Precall Sports Council'
  AND NOT EXISTS (
    SELECT 1 FROM "agent_configs" c WHERE c."agent_id" = a."id"
  );

ALTER TABLE "sports_predictions" ADD COLUMN IF NOT EXISTS "agent_id" integer;
ALTER TABLE "circle_actions" ADD COLUMN IF NOT EXISTS "related_agent_id" integer;

UPDATE "sports_predictions"
SET "agent_id" = (
  SELECT "id"
  FROM "agents"
  WHERE "name" = 'Precall Sports Council'
  ORDER BY "id"
  LIMIT 1
)
WHERE "agent_id" IS NULL;

ALTER TABLE "sports_predictions" ALTER COLUMN "agent_id" SET NOT NULL;

DROP INDEX IF EXISTS "sports_predictions_market_outcome_idx";
CREATE UNIQUE INDEX IF NOT EXISTS "sports_predictions_agent_market_outcome_idx" ON "sports_predictions" USING btree ("agent_id", "market_id", "selected_outcome_index");
CREATE INDEX IF NOT EXISTS "sports_predictions_agent_idx" ON "sports_predictions" USING btree ("agent_id");
CREATE INDEX IF NOT EXISTS "circle_actions_agent_idx" ON "circle_actions" USING btree ("related_agent_id");
