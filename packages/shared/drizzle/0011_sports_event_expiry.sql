UPDATE "sports_predictions"
SET "status" = 'expired',
    "resolution_status" = 'expired',
    "status_reason" = 'Expired sports live call. Event start has passed or selected-outcome settlement is not enabled yet.',
    "updated_at" = now()
WHERE "status" in ('strong_call', 'lean_call', 'high_risk_call', 'avoid_call')
  AND (
    ("event_start_time" IS NOT NULL AND "event_start_time" <= now())
    OR ("expires_at" IS NOT NULL AND "expires_at" <= now())
  );
