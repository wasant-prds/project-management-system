import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { parseEnv } from 'node:util'
import { config, inventory, sql, verifyRollout } from './db-rollout.mjs'

export const projectDateSnapshotSQL = `SELECT json_build_object(
  'rows', count(*),
  'calendarHash', md5(coalesce(string_agg(id || '|' || "startDate"::date::text || '|' || "dueDate"::date::text, '' ORDER BY id), '')),
  'otherHash', md5(coalesce(string_agg(md5((to_jsonb(p) - 'startDate' - 'dueDate')::text), '' ORDER BY id), '')))
FROM "Project" p;`

export const promoteProjectDatesSQL = `BEGIN;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM "Project" WHERE "startDate"::time <> time '00:00:00' OR "dueDate"::time <> time '00:00:00') THEN
    RAISE EXCEPTION 'Project date contains a time component';
  END IF;
END $$;
CREATE TEMP TABLE project_date_audit ON COMMIT DROP AS ${projectDateSnapshotSQL}
ALTER TABLE "Project" ALTER COLUMN "startDate" TYPE date USING "startDate"::date,
  ALTER COLUMN "dueDate" TYPE date USING "dueDate"::date;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM project_date_audit a WHERE row_to_json(a)::jsonb IS DISTINCT FROM
    (SELECT row_to_json(now_state)::jsonb FROM (${projectDateSnapshotSQL.replace(/;$/, '')}) now_state)) THEN
    RAISE EXCEPTION 'Project date or history verification failed';
  END IF;
END $$;
COMMIT;`

export function projectDateSnapshot(container, run) {
  return JSON.parse(sql(container, projectDateSnapshotSQL, run))
}

async function main() {
  const [command, environment, archive] = process.argv.slice(2)
  if (command !== '--apply' || !environment || !archive) {
    throw new Error('Usage: node scripts/project-date-promotion.mjs --apply <environment> <verified-archive>')
  }
  const rootEnv = parseEnv(await readFile(new URL('../.env', import.meta.url), 'utf8'))
  const settings = config(rootEnv)
  if (settings.site !== environment) throw new Error('APP_ENV does not match requested environment')
  await verifyRollout(settings, archive, 'required')
  const before = inventory(settings.container)
  const datesBefore = projectDateSnapshot(settings.container)
  sql(settings.container, promoteProjectDatesSQL)
  const after = inventory(settings.container)
  const datesAfter = projectDateSnapshot(settings.container)
  if (JSON.stringify(datesBefore) !== JSON.stringify(datesAfter)) throw new Error('Project date values changed')
  for (const [table, record] of Object.entries(before.tables)) {
    if (table !== 'Project' && (record.rows !== after.tables[table]?.rows || record.hash !== after.tables[table]?.hash)) {
      throw new Error(`History verification failed: ${table}`)
    }
  }
  const dates = after.columns.filter((column) => column.table === 'Project' && ['startDate', 'dueDate'].includes(column.column))
  if (dates.length !== 2 || dates.some((column) => column.type !== 'date')) throw new Error('Project date type promotion failed')
  console.log(`Project calendar dates promoted to DATE; ${datesAfter.rows} rows verified.`)
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main()
