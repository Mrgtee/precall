CREATE TABLE IF NOT EXISTS "feedback" (
  "id" serial PRIMARY KEY NOT NULL,
  "call_id" integer,
  "agent_id" integer,
  "user_wallet" text,
  "sentiment" text NOT NULL,
  "comment" text DEFAULT '' NOT NULL,
  "context" text DEFAULT '' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "feedback_call_idx" ON "feedback" ("call_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "feedback_agent_idx" ON "feedback" ("agent_id");
