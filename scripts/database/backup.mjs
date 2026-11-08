import { spawnSync } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { readFile, writeFile, mkdir, readdir, unlink, stat } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseEnv } from 'node:util'

const root = resolve(fileURLToPath(new URL('../../', import.meta.url)))
const digest = (data) => createHash('sha256').update(data).digest('hex')
export function docker(args, input) {
  const result = spawnSync('docker', args, {
    input,
    maxBuffer: 256 * 1024 * 1024,
    timeout: 120000,
    stdio: ['pipe', 'pipe', 'pipe'],
  })
  if (result.error || result.status !== 0)
    throw new Error('Database operation failed; raw diagnostics withheld')
  return result.stdout
}
const databaseCommand =
  'export PGTZ=Asia/Bangkok PGOPTIONS="-c timezone=Asia/Bangkok"; exec "$@" -U "$POSTGRES_USER" -d "$POSTGRES_DB"'
export function sql(container, query, run = docker) {
  return run(
    [
      'exec',
      '-i',
      container,
      'sh',
      '-c',
      databaseCommand,
      'db-operation',
      'psql',
      '-X',
      '-qAt',
      '-v',
      'ON_ERROR_STOP=1',
    ],
    query,
  )
    .toString()
    .trim()
}
export function config(env, base = root) {
  if (!['local', 'dev', 'uat', 'prod'].includes(env.APP_ENV)) throw new Error('Invalid APP_ENV')
  const days = Number(env.BACKUP_KEEP_DAYS || '30')
  if (!Number.isSafeInteger(days) || days < 1 || days > 3650)
    throw new Error('Set BACKUP_KEEP_DAYS to 1..3650')
  return {
    site: env.APP_ENV,
    container: `pms-postgres-${env.APP_ENV}`,
    directory: resolve(base, env.BACKUP_DIR || './database/backups/postgres_data'),
    days,
  }
}

// Inventory contains hashes and counts, never business values or credentials.
export const inventorySQL = `CREATE TEMP TABLE inventory (name text, rows bigint, hash text);
BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;
DO $$ DECLARE t text; BEGIN
 FOR t IN SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename LOOP
  EXECUTE format($query$INSERT INTO inventory SELECT %L,count(*),md5(coalesce(string_agg(md5(to_jsonb(r)::text), '' ORDER BY to_jsonb(r)::text), '')) FROM public.%I r$query$,t,t);
 END LOOP;
END $$;
SELECT json_build_object('tables',(SELECT json_object_agg(name,json_build_object('rows',rows,'hash',hash)) FROM inventory),
 'columns',(SELECT json_agg(json_build_object('table',table_name,'column',column_name,'type',data_type,'nullable',is_nullable) ORDER BY table_name,ordinal_position) FROM information_schema.columns WHERE table_schema='public'),
 'timezone',current_setting('TimeZone'),'wallClock',localtimestamp=(now() AT TIME ZONE 'Asia/Bangkok'));
COMMIT;`
export function inventory(container, run = docker) {
  const state = JSON.parse(sql(container, inventorySQL, run))
  // Inspect the database/role/server default in a fresh connection without client overrides.
  // PGOPTIONS/PGTZ otherwise make even a UTC database appear compliant.
  state.serverTimezone = run(
    [
      'exec',
      '-i',
      container,
      'sh',
      '-c',
      'unset PGOPTIONS PGTZ; exec "$@" -U "$POSTGRES_USER" -d "$POSTGRES_DB"',
      'db-operation',
      'psql',
      '-X',
      '-qAt',
      '-v',
      'ON_ERROR_STOP=1',
    ],
    'SHOW timezone;',
  )
    .toString()
    .trim()
  return state
}
export function compare(before, after) {
  const names = Object.keys(before.tables || {})
  if (Object.keys(after.tables || {}).length !== names.length) throw new Error('Restored table set differs')
  for (const name of names) {
    const a = before.tables[name],
      b = after.tables?.[name]
    if (!b || a.rows !== b.rows || a.hash !== b.hash) throw new Error(`History verification failed: ${name}`)
  }
  if (JSON.stringify(before.columns) !== JSON.stringify(after.columns))
    throw new Error('Restored column types differ')
}
export function verifyTimezone(state) {
  if (
    state.timezone !== 'Asia/Bangkok' ||
    state.serverTimezone !== 'Asia/Bangkok' ||
    state.wallClock !== true
  )
    throw new Error('Database/session timezone or wall-clock default is incorrect')
}
export async function readArchive(file, site) {
  const data = await readFile(file)
  const manifest = JSON.parse(await readFile(`${file}.json`, 'utf8'))
  if (
    manifest.version !== 1 ||
    manifest.site !== site ||
    manifest.sha256 !== digest(data) ||
    manifest.bytes !== data.length
  )
    throw new Error('Backup checksum or environment mismatch')
  return { data, manifest }
}
export async function rehearse(file, site, run = docker) {
  const { data, manifest } = await readArchive(file, site)
  const name = `pms-restore-check-${randomUUID()}`
  let started = false
  try {
    run([
      'run',
      '--rm',
      '-d',
      '--name',
      name,
      '--network',
      'none',
      '-e',
      'POSTGRES_HOST_AUTH_METHOD=trust',
      '-e',
      'POSTGRES_USER=postgres',
      '-e',
      'POSTGRES_DB=postgres',
      'postgres:16-alpine',
      '-c',
      'timezone=Asia/Bangkok',
    ])
    started = true
    let ready = false
    for (let attempt = 0; attempt < 60; attempt++) {
      try {
        run(['exec', name, 'pg_isready', '-h', '127.0.0.1', '-U', 'postgres', '-d', 'postgres'])
        ready = true
        break
      } catch {}
      await new Promise((done) => setTimeout(done, 250))
    }
    if (!ready) throw new Error('Isolated restore database did not become ready')
    run(['exec', '-i', name, 'sh', '-c', 'cat > /tmp/restore.dump'], data)
    run([
      'exec',
      name,
      'sh',
      '-c',
      databaseCommand,
      'db-operation',
      'pg_restore',
      '--exit-on-error',
      '--single-transaction',
      '--no-owner',
      '--no-privileges',
      '/tmp/restore.dump',
    ])
    const restored = inventory(name, run)
    compare(manifest.inventory, restored)
    verifyTimezone(restored)
    await writeFile(
      `${file}.verified.json`,
      JSON.stringify(
        {
          version: 1,
          site,
          sha256: manifest.sha256,
          verifiedAt: bangkokNow(),
          result: 'isolated-restore-passed',
        },
        null,
        2,
      ),
      { mode: 0o600 },
    )
    return restored
  } finally {
    if (started) run(['rm', '-f', name])
  }
}
export function bangkokNow() {
  const parts = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Bangkok',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).format(new Date())
  return `${parts.replace(' ', 'T')}+07:00`
}
export async function backup(settings, run = docker) {
  await mkdir(settings.directory, { recursive: true, mode: 0o700 })
  const before = inventory(settings.container, run)
  verifyTimezone(before)
  const data = run([
    'exec',
    settings.container,
    'sh',
    '-c',
    databaseCommand,
    'db-operation',
    'pg_dump',
    '--format=custom',
    '--no-owner',
    '--no-privileges',
  ])
  // Writes must be quiesced by the operator. Never certify a moving baseline.
  compare(before, inventory(settings.container, run))
  const file = join(
    settings.directory,
    `pms_${settings.site}_${bangkokNow().replace(/[^0-9]/g, '')}_${randomUUID()}.dump`,
  )
  await writeFile(file, data, { flag: 'wx', mode: 0o600 })
  await writeFile(
    `${file}.json`,
    JSON.stringify(
      {
        version: 1,
        site: settings.site,
        createdAt: bangkokNow(),
        bytes: data.length,
        sha256: digest(data),
        keepDays: settings.days,
        inventory: before,
      },
      null,
      2,
    ),
    { flag: 'wx', mode: 0o600 },
  )
  await rehearse(file, settings.site, run)
  return file
}

// Explicit cleanup only: pinned rollout archives and the newest verified archive survive.
export async function prune(settings, now = Date.now()) {
  const files = (await readdir(settings.directory)).filter(
    (f) => f.startsWith(`pms_${settings.site}_`) && f.endsWith('.dump'),
  )
  const verified = []
  for (const name of files) {
    const file = join(settings.directory, name)
    try {
      const { manifest } = await readArchive(file, settings.site)
      const receipt = JSON.parse(await readFile(`${file}.verified.json`, 'utf8'))
      if (
        receipt.sha256 !== manifest.sha256 ||
        receipt.site !== settings.site ||
        receipt.result !== 'isolated-restore-passed'
      )
        continue
      verified.push({ file, created: Date.parse(manifest.createdAt) })
    } catch {
      /* Unverified or corrupt artifacts need operator review, never automatic deletion. */
    }
  }
  verified.sort((a, b) => b.created - a.created)
  let removed = 0
  for (const item of verified.slice(1)) {
    if (!Number.isFinite(item.created) || now - item.created <= settings.days * 86400000) continue
    try {
      await stat(`${item.file}.pin`)
      continue
    } catch (error) {
      if (error.code !== 'ENOENT') throw error
    }
    for (const suffix of ['', '.json', '.verified.json']) await unlink(`${item.file}${suffix}`)
    removed++
  }
  return { removed }
}

export async function health(settings, env, run = docker, fetcher = fetch) {
  for (const [name, expected] of [
    [settings.container, 'running'],
    [`pms-app-${settings.site === 'local' ? 'dev' : settings.site}`, 'running'],
  ]) {
    if (run(['inspect', '--format', '{{.State.Status}}', name]).toString().trim() !== expected)
      throw new Error('Application/database is not running')
  }
  const initialized = run([
    'inspect',
    '--format',
    '{{.State.Status}}:{{.State.ExitCode}}',
    `pms-database-init-${settings.site}`,
  ])
    .toString()
    .trim()
  if (initialized !== 'exited:0') throw new Error('Database initializer did not complete successfully')
  const url = new URL('/api/health', env.APP_ORIGIN)
  if (url.username || url.password || !['http:', 'https:'].includes(url.protocol))
    throw new Error('Invalid health origin')
  const response = await fetcher(url, { signal: AbortSignal.timeout(10000), redirect: 'error' })
  if (response.status !== 200 || (await response.json()).database !== 'connected')
    throw new Error('Application health failed')
  verifyTimezone(inventory(settings.container, run))
  return { database: 'connected', initializer: 'exited:0', app: 'healthy', timezone: 'Asia/Bangkok' }
}
export async function main(args = process.argv.slice(2)) {
  // Match db-env.sh: the single root .env selects the site, regardless of stale shell APP_ENV.
  const env = parseEnv(await readFile(join(root, '.env'), 'utf8'))
  const settings = config(env)
  if (args[0] === 'backup')
    console.log(JSON.stringify({ result: 'verified-backup', file: await backup(settings) }))
  else if (args[0] === 'rehearse' && args[1]) {
    await rehearse(resolve(args[1]), settings.site)
    console.log('Isolated restore passed')
  } else if (args[0] === 'health') console.log(JSON.stringify(await health(settings, env)))
  else if (args[0] === 'prune') console.log(JSON.stringify(await prune(settings)))
  else throw new Error('Usage: node scripts/database/backup.mjs backup|rehearse <archive>|health|prune')
}
if (process.argv[1] === fileURLToPath(import.meta.url))
  main().catch((error) => {
    const safeConfigurationErrors = ['Invalid APP_ENV', 'Set BACKUP_KEEP_DAYS to 1..3650']
    const reason = safeConfigurationErrors.includes(error.message)
      ? error.message
      : 'Check configuration, backup and isolated tests; diagnostics withheld'
    console.error(`Database operation failed. ${reason}`)
    process.exitCode = 1
  })
