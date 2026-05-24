ALTER TABLE "sports_predictions" ADD COLUMN IF NOT EXISTS "unlock_price" numeric(18, 6) DEFAULT '0.05' NOT NULL;
ALTER TABLE "sports_predictions" ADD COLUMN IF NOT EXISTS "resolution_status" text DEFAULT 'unresolved' NOT NULL;
ALTER TABLE "sports_predictions" ADD COLUMN IF NOT EXISTS "resolved_outcome_index" integer;
ALTER TABLE "sports_predictions" ADD COLUMN IF NOT EXISTS "resolved_outcome" text;
ALTER TABLE "sports_predictions" ADD COLUMN IF NOT EXISTS "resolved_at" timestamptz;

CREATE TABLE IF NOT EXISTS "sports_unlocks" (
  "id" serial PRIMARY KEY NOT NULL,
  "sports_prediction_id" integer NOT NULL,
  "user_wallet" text NOT NULL,
  "amount" numeric(18, 6) NOT NULL,
  "tx_hash" text NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "sports_unlocks_prediction_wallet_idx" ON "sports_unlocks" ("sports_prediction_id", "user_wallet");
CREATE INDEX IF NOT EXISTS "sports_unlocks_tx_hash_idx" ON "sports_unlocks" ("tx_hash");
CREATE INDEX IF NOT EXISTS "sports_predictions_resolution_status_idx" ON "sports_predictions" ("resolution_status");

UPDATE "sports_predictions"
SET "status" = 'expired',
    "resolution_status" = 'expired',
    "status_reason" = 'Expired sports live call. Selected-outcome settlement is not enabled yet.'
WHERE "status" in ('strong_call', 'lean_call', 'high_risk_call', 'avoid_call')
  AND "expires_at" IS NOT NULL
  AND "expires_at" <= now();
