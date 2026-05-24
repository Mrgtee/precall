ALTER TABLE "sports_predictions" ADD COLUMN IF NOT EXISTS "reasoning" text DEFAULT '' NOT NULL;
ALTER TABLE "sports_predictions" ADD COLUMN IF NOT EXISTS "evidence_ids" jsonb DEFAULT '[]'::jsonb NOT NULL;
ALTER TABLE "sports_predictions" ADD COLUMN IF NOT EXISTS "source_urls" jsonb DEFAULT '[]'::jsonb NOT NULL;
ALTER TABLE "sports_predictions" ADD COLUMN IF NOT EXISTS "x402_paid_evidence_used" boolean DEFAULT false NOT NULL;
ALTER TABLE "sports_predictions" ADD COLUMN IF NOT EXISTS "event_start_time" timestamptz;

UPDATE "sports_predictions"
SET "reasoning" = "rationale"
WHERE "reasoning" = '';

UPDATE "sports_predictions"
SET "status" = CASE
  WHEN "status" = 'active' THEN 'strong_call'
  WHEN "status" = ('watch' || 'list') THEN 'lean_call'
  ELSE "status"
END;

UPDATE "sports_predictions"
SET "status_reason" = CASE
  WHEN "status" = 'strong_call' AND ("status_reason" = '' OR "status_reason" ILIKE ('%' || 'watch' || 'list' || '%') OR "status_reason" ILIKE ('%' || 'Sports ' || 'Edge' || '%')) THEN 'Strong sports live call: migrated from previous quality-passing sports idea.'
  WHEN "status" = 'lean_call' AND ("status_reason" = '' OR "status_reason" ILIKE ('%' || 'watch' || 'list' || '%') OR "status_reason" ILIKE ('%' || 'Sports ' || 'Edge' || '%')) THEN 'Lean sports live call: migrated from previous filtered sports analysis.'
  ELSE "status_reason"
END;

ALTER TABLE "sports_predictions" ALTER COLUMN "status" SET DEFAULT 'lean_call';
CREATE INDEX IF NOT EXISTS "sports_predictions_event_start_time_idx" ON "sports_predictions" ("event_start_time");
CREATE INDEX IF NOT EXISTS "sports_predictions_x402_paid_idx" ON "sports_predictions" ("x402_paid_evidence_used");
