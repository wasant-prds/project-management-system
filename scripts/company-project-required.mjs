import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { parseEnv } from 'node:util'
import { config, sql, verifyRollout } from './db-rollout.mjs'

async function main() {
  const [command, environment, archive] = process.argv.slice(2)
  if (command !== '--apply' || !environment || !archive) {
    throw new Error('Usage: node scripts/company-project-required.mjs --apply <environment> <verified-archive>')
  }
  const rootEnv = parseEnv(await readFile(new URL('../.env', import.meta.url), 'utf8'))
  const settings = config(rootEnv)
  if (settings.site !== environment) throw new Error('APP_ENV does not match requested environment')
  await verifyRollout(settings, archive, 'backfilled')
  sql(settings.container, `BEGIN;
    DO $$ BEGIN
      IF EXISTS (SELECT 1 FROM "Project" WHERE "companyId" IS NULL) THEN
        RAISE EXCEPTION 'Unlinked Project remains';
      END IF;
    END $$;
    ALTER TABLE "Project" ALTER COLUMN "companyId" SET NOT NULL;
    COMMIT;`)
  await verifyRollout(settings, archive, 'required')
  console.log('Project.companyId is required; rollout required gate passed.')
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main()
