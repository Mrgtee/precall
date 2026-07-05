CREATE TABLE IF NOT EXISTS "admin_challenge_uses" (
  "id" serial PRIMARY KEY NOT NULL,
  "challenge_mac" text NOT NULL,
  "nonce" text NOT NULL,
  "action" text NOT NULL,
  "signer_wallet" text NOT NULL,
  "target_wallet" text DEFAULT '' NOT NULL,
  "consumed_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "admin_challenge_uses_mac_idx" ON "admin_challenge_uses" ("challenge_mac");
CREATE INDEX IF NOT EXISTS "admin_challenge_uses_signer_idx" ON "admin_challenge_uses" ("signer_wallet");
CREATE INDEX IF NOT EXISTS "admin_challenge_uses_consumed_at_idx" ON "admin_challenge_uses" ("consumed_at");
