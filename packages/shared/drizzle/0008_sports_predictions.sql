CREATE TABLE IF NOT EXISTS "sports_predictions" (
  "id" serial PRIMARY KEY NOT NULL,
  "market_id" text NOT NULL,
  "market_title" text NOT NULL,
  "market_url" text NOT NULL,
  "category" text NOT NULL,
  "market_kind" text NOT NULL,
  "selected_option" text NOT NULL,
  "selected_outcome_index" integer NOT NULL,
  "market_price_bps" integer NOT NULL,
  "agent_probability_bps" integer NOT NULL,
  "edge_bps" integer NOT NULL,
  "confidence_bps" integer NOT NULL,
  "risk_level" text NOT NULL,
  "rationale" text NOT NULL,
  "matchup_context" text DEFAULT '' NOT NULL,
  "market_movement" text DEFAULT '' NOT NULL,
  "risks" jsonb NOT NULL,
  "verdict" text NOT NULL,
  "evidence_context" jsonb NOT NULL,
  "votes" jsonb NOT NULL,
  "x402_status" jsonb,
  "status" text DEFAULT 'active' NOT NULL,
  "status_reason" text DEFAULT '' NOT NULL,
  "source_run_id" integer,
  "expires_at" timestamptz,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "sports_predictions_market_outcome_idx" ON "sports_predictions" ("market_id", "selected_outcome_index");
CREATE INDEX IF NOT EXISTS "sports_predictions_status_idx" ON "sports_predictions" ("status");
CREATE INDEX IF NOT EXISTS "sports_predictions_created_at_idx" ON "sports_predictions" ("created_at");
