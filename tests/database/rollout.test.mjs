import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, writeFile, rm, access } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import {
  config,
  compare,
  verifyTimezone,
  readArchive,
  rehearse,
  prune,
  health,
  docker,
} from '../../scripts/database/backup.mjs'

const tables = Object.fromEntries(
  ['projects', 'work_items', 'work_logs'].map((t) => [t, { rows: 1, hash: 'exact', historyHash: 'history' }]),
)
const state = {
  tables,
  columns: [],
  timezone: 'Asia/Bangkok',
  serverTimezone: 'Asia/Bangkok',
  wallClock: true,
}
test('environment is explicit; backup directory and retention use approved defaults or overrides', () => {
  for (const APP_ENV of ['local', 'dev', 'uat', 'prod'])
    assert.equal(
      config({ APP_ENV, BACKUP_DIR: './backups', BACKUP_KEEP_DAYS: '30' }).container,
      `pms-postgres-${APP_ENV}`,
    )
  const base = join(tmpdir(), 'fixture')
  for (const APP_ENV of ['local', 'dev', 'uat', 'prod'])
    for (const BACKUP_KEEP_DAYS of [undefined, ''])
      assert.equal(config({ APP_ENV, BACKUP_KEEP_DAYS }, base).days, 30)
  assert.equal(config({ APP_ENV: 'prod', BACKUP_KEEP_DAYS: '7' }, base).days, 7)
  for (const BACKUP_DIR of [undefined, ''])
    assert.equal(
      config({ APP_ENV: 'prod', BACKUP_KEEP_DAYS: '3', BACKUP_DIR }, base).directory,
      join(base, 'database', 'backups', 'postgres_data'),
    )
  assert.equal(
    config({ APP_ENV: 'dev', BACKUP_KEEP_DAYS: '3', BACKUP_DIR: './custom' }, base).directory,
    join(base, 'custom'),
  )
  for (const env of [
    {},
    { APP_ENV: 'production' },
    ...['0', '-1', 'abc', '2.5', '3651'].map((BACKUP_KEEP_DAYS) => ({
      APP_ENV: 'dev',
      BACKUP_DIR: './backups',
      BACKUP_KEEP_DAYS,
    })),
  ])
    assert.throws(() => config(env))
})
test('exact verification rejects deleted rows, same-count edits, changed decimals/dates/types and extra tables', () => {
  compare(state, structuredClone(state))
  for (const mutate of [
    (s) => s.tables.work_logs.rows--,
    (s) => (s.tables.work_items.hash = 'changed'),
    (s) => delete s.tables.projects,
    (s) => (s.tables.extra = {}),
    (s) => s.columns.push({ type: 'timestamp with time zone' }),
  ]) {
    const altered = structuredClone(state)
    mutate(altered)
    assert.throws(() => compare(state, altered))
  }
})
test('Bangkok database and session timezone checks reject drift', () => {
  for (const changes of [{ timezone: 'UTC' }, { serverTimezone: 'UTC' }, { wallClock: false }])
    assert.throws(() => verifyTimezone({ ...state, ...changes }))
})
async function artifact(folder, name, createdAt) {
  const file = join(folder, `pms_dev_${name}.dump`),
    data = Buffer.from('synthetic-archive')
  const sha256 = createHash('sha256').update(data).digest('hex')
  await writeFile(file, data)
  await writeFile(
    `${file}.json`,
    JSON.stringify({ version: 1, site: 'dev', createdAt, bytes: data.length, sha256, inventory: state }),
  )
  await writeFile(
    `${file}.verified.json`,
    JSON.stringify({ site: 'dev', sha256, result: 'isolated-restore-passed' }),
  )
  return file
}
test('corrupt/wrong environment archives cannot start a restore; failed restore cleans only its isolated container', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'pms-rollout-unit-'))
  try {
    const file = await artifact(dir, 'failure', '2026-01-01T00:00:00+07:00')
    await assert.rejects(readArchive(file, 'prod'))
    await writeFile(file, 'corrupt')
    let calls = []
    await assert.rejects(
      rehearse(file, 'dev', (args) => {
        calls.push(args)
        return Buffer.from('')
      }),
    )
    assert.equal(calls.length, 0)
    await artifact(dir, 'failure', '2026-01-01T00:00:00+07:00')
    calls = []
    await assert.rejects(
      rehearse(file, 'dev', (args) => {
        calls.push(args)
        if (args.includes('pg_restore')) throw new Error('synthetic failure')
        return Buffer.from('1')
      }),
    )
    assert.ok(calls[0].includes('none'))
    assert.ok(!calls[0].includes('-p') && !calls[0].includes('-v'))
    assert.equal(calls.at(-1)[0], 'rm')
    assert.match(calls.at(-1)[2], /^pms-restore-check-/)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})
test('retention preserves newest, pinned, corrupt, unverified and other-environment artifacts', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'pms-retention-'))
  try {
    const old = await artifact(dir, 'old', '2026-01-01T00:00:00+07:00')
    const pinned = await artifact(dir, 'pinned', '2026-01-02T00:00:00+07:00')
    await writeFile(`${pinned}.pin`, 'rollout')
    const latest = await artifact(dir, 'latest', '2026-01-03T00:00:00+07:00')
    const corrupt = await artifact(dir, 'corrupt', '2026-01-01T00:00:00+07:00')
    await writeFile(corrupt, 'corrupt')
    await writeFile(join(dir, 'pms_prod_old.dump'), 'other-site')
    await writeFile(join(dir, 'pms_dev_unverified.dump'), 'unverified')
    assert.deepEqual(
      await prune({ directory: dir, site: 'dev', days: 3 }, Date.parse('2026-09-28T00:00:00+07:00')),
      { removed: 1 },
    )
    await assert.rejects(access(old))
    for (const f of [
      pinned,
      latest,
      corrupt,
      join(dir, 'pms_prod_old.dump'),
      join(dir, 'pms_dev_unverified.dump'),
    ])
      await access(f)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})
test('health verifies app, database, database initialization and actual endpoint; no secrets in arguments', async () => {
  const settings = { site: 'uat', container: 'pms-postgres-uat' }
  const calls = []
  const run = (args, input) => {
    calls.push(args)
    return Buffer.from(
      input === 'SHOW timezone;'
        ? 'Asia/Bangkok'
        : args.includes('psql')
          ? JSON.stringify(state)
          : args.includes('pms-database-init-uat')
            ? 'exited:0'
            : 'running',
    )
  }
  assert.equal(
    (
      await health(
        settings,
        { APP_ORIGIN: 'http://localhost:3001', POSTGRES_PASSWORD: 'never-log' },
        run,
        async () => ({ status: 200, json: async () => ({ database: 'connected' }) }),
      )
    ).app,
    'healthy',
  )
  assert.ok(!JSON.stringify(calls).includes('never-log'))
  await assert.rejects(
    health(settings, { APP_ORIGIN: 'http://localhost' }, run, async () => ({ status: 503 })),
  )
  await assert.rejects(health(settings, { APP_ORIGIN: 'http://localhost' }, () => Buffer.from('running')))
  assert.throws(() => docker(['this-is-not-a-docker-command']), /diagnostics withheld/)
})
