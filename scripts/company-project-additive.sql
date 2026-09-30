BEGIN;

ALTER TABLE "Company" ADD COLUMN IF NOT EXISTS code text;
CREATE UNIQUE INDEX IF NOT EXISTS "Company_code_key" ON "Company" (code);
ALTER TABLE "Company" ADD COLUMN IF NOT EXISTS "displayName" text;
ALTER TABLE "Company" ADD COLUMN IF NOT EXISTS "location" text;

ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "companyId" text;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = '"Project"'::regclass AND conname = 'Project_companyId_fkey') THEN
    ALTER TABLE "Project" ADD CONSTRAINT "Project_companyId_fkey"
      FOREIGN KEY ("companyId") REFERENCES "Company"(id) ON DELETE RESTRICT;
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS "Project_companyId_status_idx" ON "Project" ("companyId", status);

-- Keep existing Project history if a delete races with a dependent write.
DO $$
DECLARE fk record;
BEGIN
  FOR fk IN
    SELECT conname, conrelid::regclass AS table_name, pg_get_constraintdef(oid) AS definition
    FROM pg_constraint
    WHERE confrelid = '"Project"'::regclass AND contype = 'f' AND confdeltype = 'c'
  LOOP
    EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I', fk.table_name, fk.conname);
    EXECUTE format('ALTER TABLE %s ADD CONSTRAINT %I %s',
      fk.table_name, fk.conname,
      replace(fk.definition, 'ON DELETE CASCADE', 'ON DELETE RESTRICT'));
  END LOOP;
END $$;

COMMIT;
