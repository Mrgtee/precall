CREATE TABLE IF NOT EXISTS "users" (
  "id" serial PRIMARY KEY NOT NULL,
  "wallet_address" text NOT NULL UNIQUE,
  "display_name" text,
  "referral_source" text,
  "first_seen_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "agents" (
  "id" serial PRIMARY KEY NOT NULL,
  "onchain_agent_id" integer UNIQUE,
  "name" text NOT NULL,
  "role" text NOT NULL,
  "owner_wallet" text NOT NULL,
  "metadata_uri" text DEFAULT '' NOT NULL,
  "active" boolean DEFAULT true NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "markets" (
  "id" serial PRIMARY KEY NOT NULL,
  "source" text NOT NULL,
  "market_id" text NOT NULL,
  "condition_id" text DEFAULT '' NOT NULL,
  "slug" text DEFAULT '' NOT NULL,
  "title" text NOT NULL,
  "url" text NOT NULL,
  "outcomes" jsonb NOT NULL,
  "close_time" timestamp with time zone,
  "liquidity_usd" numeric(18, 6) DEFAULT '0' NOT NULL,
  "status" text DEFAULT 'active' NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "markets_source_market_idx" ON "markets" ("source", "market_id");
CREATE INDEX IF NOT EXISTS "markets_status_idx" ON "markets" ("status");

CREATE TABLE IF NOT EXISTS "market_snapshots" (
  "id" serial PRIMARY KEY NOT NULL,
  "market_id" text NOT NULL,
  "yes_price_bps" integer NOT NULL,
  "no_price_bps" integer NOT NULL,
  "spread_bps" integer NOT NULL,
  "depth_usd" numeric(18, 6) DEFAULT '0' NOT NULL,
  "captured_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "market_snapshots_market_idx" ON "market_snapshots" ("market_id");

CREATE TABLE IF NOT EXISTS "calls" (
  "id" serial PRIMARY KEY NOT NULL,
  "onchain_call_id" integer UNIQUE,
  "agent_id" integer NOT NULL,
  "market_id" text NOT NULL,
  "action" text NOT NULL,
  "market_price_bps" integer NOT NULL,
  "agent_probability_bps" integer NOT NULL,
  "edge_bps" integer NOT NULL,
  "confidence_bps" integer NOT NULL,
  "suggested_size_bps" integer NOT NULL,
  "thesis_hash" text NOT NULL,
  "evidence_hash" text NOT NULL,
  "thesis" text NOT NULL,
  "counterarguments" jsonb NOT NULL,
  "bond_amount" numeric(18, 6) NOT NULL,
  "unlock_price" numeric(18, 6) NOT NULL,
  "status" text DEFAULT 'draft' NOT NULL,
  "tx_hash" text,
  "copy_url" text DEFAULT '' NOT NULL,
  "published_at" timestamp with time zone DEFAULT now() NOT NULL,
  "expires_at" timestamp with time zone
);

CREATE INDEX IF NOT EXISTS "calls_market_idx" ON "calls" ("market_id");
CREATE INDEX IF NOT EXISTS "calls_status_idx" ON "calls" ("status");

CREATE TABLE IF NOT EXISTS "evidence_items" (
  "id" serial PRIMARY KEY NOT NULL,
  "call_id" integer NOT NULL,
  "source_url" text NOT NULL,
  "title" text NOT NULL,
  "excerpt" text NOT NULL,
  "credibility_score" integer NOT NULL
);

CREATE TABLE IF NOT EXISTS "thesis_unlocks" (
  "id" serial PRIMARY KEY NOT NULL,
  "call_id" integer NOT NULL,
  "user_wallet" text NOT NULL,
  "amount" numeric(18, 6) NOT NULL,
  "tx_hash" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "thesis_unlocks_call_wallet_idx" ON "thesis_unlocks" ("call_id", "user_wallet");

CREATE TABLE IF NOT EXISTS "agent_runs" (
  "id" serial PRIMARY KEY NOT NULL,
  "status" text NOT NULL,
  "model" text NOT NULL,
  "inputs" jsonb NOT NULL,
  "outputs" jsonb,
  "costs" jsonb,
  "failure" text,
  "published_call_id" integer,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "resolutions" (
  "id" serial PRIMARY KEY NOT NULL,
  "call_id" integer NOT NULL UNIQUE,
  "final_outcome" text NOT NULL,
  "final_price_bps" integer NOT NULL,
  "roi_bps" integer NOT NULL,
  "brier_score_bps" integer NOT NULL,
  "resolver_tx" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "follows" (
  "id" serial PRIMARY KEY NOT NULL,
  "user_wallet" text NOT NULL,
  "agent_id" integer NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "follows_wallet_agent_idx" ON "follows" ("user_wallet", "agent_id");
