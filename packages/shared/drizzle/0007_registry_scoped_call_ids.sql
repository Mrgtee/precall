DO $$
DECLARE
  constraint_name text;
BEGIN
  SELECT con.conname INTO constraint_name
  FROM pg_constraint con
  JOIN pg_class rel ON rel.oid = con.conrelid
  JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
  JOIN pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
  WHERE nsp.nspname = current_schema()
    AND rel.relname = 'calls'
    AND con.contype = 'u'
    AND array_length(con.conkey, 1) = 1
    AND att.attname = 'onchain_call_id'
  LIMIT 1;

  IF constraint_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE "calls" DROP CONSTRAINT %I', constraint_name);
  END IF;
END $$;
--> statement-breakpoint
DROP INDEX IF EXISTS "calls_onchain_call_id_unique";
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "calls_registry_onchain_call_idx" ON "calls" ("registry_address", "onchain_call_id");
