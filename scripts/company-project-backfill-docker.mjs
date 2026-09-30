import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { parseEnv } from 'node:util'
import dhasCompany from '../lib/dhas-company.json' with { type: 'json' }
import { config, sql, verifyRollout } from './db-rollout.mjs'

const quote = (value) => `'${value.replaceAll("'", "''")}'`
const dhasName = quote(dhasCompany.name)

export function checkDhasBackfill(container, run) {
  const result = JSON.parse(sql(container, `SELECT json_build_object(
    'projects', (SELECT count(*) FROM "Project"),
    'dhasMatches', (SELECT count(*) FROM "Company" WHERE code='dhas' OR name=${dhasName}),
    'codeConflicts', (SELECT count(*) FROM "Company" WHERE code='dhas' AND name<>${dhasName}),
    'projectConflicts', (SELECT count(*) FROM "Project" WHERE "companyId" IS NOT NULL AND "companyId" IS DISTINCT FROM
      (SELECT id FROM "Company" WHERE code='dhas' OR name=${dhasName} LIMIT 1)));`, run))
  if (result.dhasMatches > 1 || result.codeConflicts > 0 || result.projectConflicts > 0) {
    throw new Error('Dhas Company or Project mapping conflict; stop rollout')
  }
  return result.projects
}

export function dhasBackfillSQL(id) {
  const fields = ['name', 'displayName', 'location', 'address', 'phone', 'description']
  const columns = fields.map((field) => `"${field}"`).join(', ')
  const values = fields.map((field) => quote(dhasCompany[field])).join(', ')
  return `BEGIN ISOLATION LEVEL SERIALIZABLE;
DO $$ BEGIN
  IF (SELECT count(*) FROM "Company" WHERE code='dhas' OR name=${dhasName}) > 1
    OR EXISTS (SELECT 1 FROM "Company" WHERE code='dhas' AND name<>${dhasName})
    OR EXISTS (SELECT 1 FROM "Project" WHERE "companyId" IS NOT NULL AND "companyId" IS DISTINCT FROM
      (SELECT id FROM "Company" WHERE code='dhas' OR name=${dhasName} LIMIT 1)) THEN
    RAISE EXCEPTION 'Dhas mapping conflict';
  END IF;
END $$;
UPDATE "Company" SET code='dhas' WHERE name=${dhasName} AND code IS NULL;
INSERT INTO "Company" (id, code, ${columns}, "updatedAt")
  SELECT ${quote(id)}, 'dhas', ${values}, localtimestamp
  WHERE NOT EXISTS (SELECT 1 FROM "Company" WHERE code='dhas');
UPDATE "Project" SET "companyId"=(SELECT id FROM "Company" WHERE code='dhas') WHERE "companyId" IS NULL;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM "Project" WHERE "companyId" IS NULL) THEN
    RAISE EXCEPTION 'Unlinked Project remains';
  END IF;
END $$;
COMMIT;`
}

async function main() {
  const [command, environment, archive] = process.argv.slice(2)
  if (!['--check', '--apply'].includes(command) || !environment || !archive) {
    throw new Error('Usage: node scripts/company-project-backfill-docker.mjs <--check|--apply> <environment> <verified-archive>')
  }
  const rootEnv = parseEnv(await readFile(new URL('../.env', import.meta.url), 'utf8'))
  const settings = config(rootEnv)
  if (settings.site !== environment) throw new Error('APP_ENV does not match requested environment')
  await verifyRollout(settings, archive, 'additive')
  const count = checkDhasBackfill(settings.container)
  if (command === '--check') {
    console.log(`Dhas backfill ready: ${count} Projects; no rows changed.`)
    return
  }
  sql(settings.container, dhasBackfillSQL(`c${randomUUID().replaceAll('-', '')}`))
  await verifyRollout(settings, archive, 'backfilled')
  console.log(`Dhas Company linked to ${count} Projects; backfilled gate passed.`)
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main()
