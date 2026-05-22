CREATE TABLE IF NOT EXISTS "admin_wallets" (
	"id" serial PRIMARY KEY NOT NULL,
	"wallet_address" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"label" text DEFAULT '' NOT NULL,
	"added_by" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "admin_wallets_wallet_address_unique" UNIQUE("wallet_address")
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "admin_wallets_wallet_idx" ON "admin_wallets" ("wallet_address");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "admin_wallets_active_idx" ON "admin_wallets" ("active");
