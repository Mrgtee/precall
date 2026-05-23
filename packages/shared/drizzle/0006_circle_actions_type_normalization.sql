ALTER TABLE "circle_actions" ADD COLUMN IF NOT EXISTS "action_type" text;
--> statement-breakpoint
UPDATE "circle_actions" SET "action_type" = 'legacy_unknown' WHERE "action_type" IS NULL OR btrim("action_type"::text) = '';
--> statement-breakpoint
ALTER TABLE "circle_actions" ALTER COLUMN "action_type" TYPE text USING coalesce(nullif(btrim("action_type"::text), ''), 'legacy_unknown');
--> statement-breakpoint
ALTER TABLE "circle_actions" ALTER COLUMN "action_type" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "circle_actions" ADD COLUMN IF NOT EXISTS "status" text DEFAULT 'success';
--> statement-breakpoint
UPDATE "circle_actions" SET "status" = 'success' WHERE "status" IS NULL OR btrim("status"::text) = '';
--> statement-breakpoint
ALTER TABLE "circle_actions" ALTER COLUMN "status" TYPE text USING coalesce(nullif(btrim("status"::text), ''), 'success');
--> statement-breakpoint
ALTER TABLE "circle_actions" ALTER COLUMN "status" SET DEFAULT 'success';
--> statement-breakpoint
ALTER TABLE "circle_actions" ALTER COLUMN "status" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "circle_actions" ADD COLUMN IF NOT EXISTS "amount" numeric(18, 6) DEFAULT '0';
--> statement-breakpoint
ALTER TABLE "circle_actions" ALTER COLUMN "amount" DROP DEFAULT;
--> statement-breakpoint
ALTER TABLE "circle_actions" ALTER COLUMN "amount" TYPE numeric(18, 6) USING CASE WHEN "amount" IS NULL THEN 0::numeric WHEN btrim("amount"::text) ~ '^-?\d+(\.\d+)?$' THEN btrim("amount"::text)::numeric ELSE 0::numeric END;
--> statement-breakpoint
UPDATE "circle_actions" SET "amount" = 0 WHERE "amount" IS NULL;
--> statement-breakpoint
ALTER TABLE "circle_actions" ALTER COLUMN "amount" SET DEFAULT '0';
--> statement-breakpoint
ALTER TABLE "circle_actions" ALTER COLUMN "amount" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "circle_actions" ADD COLUMN IF NOT EXISTS "amount_usdc" numeric(18, 6) DEFAULT '0';
--> statement-breakpoint
ALTER TABLE "circle_actions" ALTER COLUMN "amount_usdc" DROP DEFAULT;
--> statement-breakpoint
ALTER TABLE "circle_actions" ALTER COLUMN "amount_usdc" TYPE numeric(18, 6) USING CASE WHEN "amount_usdc" IS NULL THEN 0::numeric WHEN btrim("amount_usdc"::text) ~ '^-?\d+(\.\d+)?$' THEN btrim("amount_usdc"::text)::numeric ELSE 0::numeric END;
--> statement-breakpoint
UPDATE "circle_actions" SET "amount_usdc" = coalesce(nullif("amount_usdc", 0), "amount", 0) WHERE "amount_usdc" IS NULL OR ("amount_usdc" = 0 AND "amount" <> 0);
--> statement-breakpoint
ALTER TABLE "circle_actions" ALTER COLUMN "amount_usdc" SET DEFAULT '0';
--> statement-breakpoint
ALTER TABLE "circle_actions" ALTER COLUMN "amount_usdc" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "circle_actions" ADD COLUMN IF NOT EXISTS "created_at" timestamp with time zone DEFAULT now();
--> statement-breakpoint
ALTER TABLE "circle_actions" ALTER COLUMN "created_at" DROP DEFAULT;
--> statement-breakpoint
ALTER TABLE "circle_actions" ALTER COLUMN "created_at" TYPE timestamp with time zone USING CASE WHEN "created_at" IS NULL THEN now() WHEN "created_at"::text ~ '^\d{4}-\d{2}-\d{2}' THEN "created_at"::text::timestamp with time zone ELSE now() END;
--> statement-breakpoint
UPDATE "circle_actions" SET "created_at" = now() WHERE "created_at" IS NULL;
--> statement-breakpoint
ALTER TABLE "circle_actions" ALTER COLUMN "created_at" SET DEFAULT now();
--> statement-breakpoint
ALTER TABLE "circle_actions" ALTER COLUMN "created_at" SET NOT NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "circle_actions_action_type_idx" ON "circle_actions" ("action_type");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "circle_actions_call_idx" ON "circle_actions" ("related_call_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "circle_actions_market_idx" ON "circle_actions" ("related_market_id");
