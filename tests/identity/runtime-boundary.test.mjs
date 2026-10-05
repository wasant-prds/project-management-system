import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import test from 'node:test'
import vm from 'node:vm'
import { resolveTestImport } from '../support/identity-modules.mjs'
import { assertRuntimeApplyEnabled, classifyDatabaseState } from '../../scripts/sql-runtime.mjs'
import {
  classifySourceSchema,
  planConversion,
  preservationPlan,
  recoveryDecision,
  rollbackPlan,
  selectRestoreTool,
  sequenceAlignmentStatements,
  verifyEquivalence,
  writeFreezeChecklist,
} from '../../scripts/sql-live-upgrade.mjs'

const require = createRequire(import.meta.url)
const ts = require('typescript')
const OWNER = '11111111-1111-4111-8111-111111111111'

function loadTs(path) {
  const source = readFileSync(new URL(path, import.meta.url), 'utf8')
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText
  const loaded = { exports: {} }
  vm.runInNewContext(output, {
    module: loaded,
    exports: loaded.exports,
    require: (name) => {
      const resolved = resolveTestImport(name, {})
      if (resolved === undefined) throw new Error(`Unexpected import: ${name}`)
      return resolved
    },
    Buffer,
    process,
    console,
  }, { filename: path })
  return loaded.exports
}

const publicId = loadTs('../../lib/public-id.ts')
const legacy = loadTs('../../lib/legacy-identity.ts')
const cursor = loadTs('../../lib/opaque-cursor.ts')

test('TC-33-01 rejects numeric, CUID, uppercase, and non-v4 public references', () => {
  assert.equal(publicId.parsePublicId(OWNER), OWNER)
  assert.equal(publicId.parsePublicId('7'), null)
  assert.equal(publicId.parsePublicId('cm8legacycuidvalue0001'), null)
  assert.equal(publicId.parsePublicId('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'.toUpperCase()), null)
  assert.equal(publicId.parsePublicId('11111111-1111-1111-8111-111111111111'), null)
  assert.equal(publicId.classifyReference('7').kind, 'rejected')
  assert.equal(publicId.classifyReference(' legacy ').kind, 'rejected')
  assert.equal(publicId.classifyReference('cm8legacycuidvalue0001').kind, 'legacy')
})

test('TC-33-02 round-trips the signed BIGINT maximum and rejects zero', () => {
  const max = publicId.BIGINT_MAX_ID
  assert.equal(publicId.serializeDecimalId(max), '9223372036854775807')
  assert.equal(publicId.parseDecimalId('9223372036854775807'), max)
  assert.throws(() => publicId.serializeDecimalId(0n), /Invalid internal ID/)
  assert.throws(() => publicId.parseDecimalId('9223372036854775808'), /Invalid decimal ID/)
})

test('TC-33-04 keeps seed mappings and numeric owner selectors out of live identity', () => {
  assert.equal(legacy.classifyOwnerSelector(undefined).kind, 'unset')
  assert.equal(legacy.classifyOwnerSelector(OWNER).kind, 'public')
  assert.equal(legacy.classifyOwnerSelector('1').kind, 'rejected')
  assert.throws(() => legacy.validateLiveIdentity({
    entityName: 'users', sourceScope: 'seed', sourceChecksum: 'a'.repeat(64), targetRevision: '31.0.0',
    oldId: 'old', createdAt: '2026-10-04T10:00:00.000', newId: '7', newPublicId: OWNER,
  }), /Seed mapping cannot authorize/)
  const live = legacy.validateLiveIdentity({
    entityName: 'users', sourceScope: 'live', sourceChecksum: 'a'.repeat(64), targetRevision: '31.0.0',
    oldId: 'old', createdAt: '2026-10-04T10:00:00.000', newId: '7', newPublicId: OWNER,
  })
  assert.equal(legacy.resolveLivePublicId('users', 'old', [live]), OWNER)
  assert.equal(legacy.resolveLivePublicId('users', 'old', [{ ...live, sourceScope: 'seed' }]), null)
})

test('TC-33-08 hides the internal key inside an opaque cursor and fails closed', () => {
  const env = { PMS_CURSOR_SECRET: 'identity-boundary-secret' }
  const token = cursor.encodeOpaqueCursor({
    ownerPublicId: OWNER, filterHash: 'year=all', internalId: 7n, tieBreaker: OWNER,
  }, env)
  assert.equal(typeof token, 'string')
  assert.equal(token.includes(OWNER), false)
  assert.equal(token.includes('"id"'), false)
  assert.equal(cursor.decodeOpaqueCursor(token, { ownerPublicId: OWNER, filterHash: 'year=all' }, env).internalId, 7n)
  assert.equal(cursor.decodeOpaqueCursor(token, { ownerPublicId: OWNER, filterHash: 'other' }, env), null)
  assert.equal(cursor.decodeOpaqueCursor(Buffer.from('{"v":1,"id":"7"}').toString('base64url'), { ownerPublicId: OWNER, filterHash: 'year=all' }, env), null)
  assert.equal(cursor.encodeOpaqueCursor({
    ownerPublicId: OWNER, filterHash: 'year=all', internalId: 7n, tieBreaker: OWNER,
  }, {}), null)
})

test('TC-33-14 refuses runtime apply without the flag, a destructive mode, or a populated untracked database', () => {
  assert.throws(() => assertRuntimeApplyEnabled({}), /disabled/)
  assert.throws(() => assertRuntimeApplyEnabled({ PMS_SQL_RUNTIME_APPLY: '1', DB_MANAGE_MODE: 'reset' }), /refused/)
  assert.throws(() => assertRuntimeApplyEnabled({ PMS_SQL_RUNTIME_APPLY: '1', ACCEPT_DATA_LOSS: 'true' }), /refused/)
  assert.doesNotThrow(() => assertRuntimeApplyEnabled({ PMS_SQL_RUNTIME_APPLY: '1' }))
  assert.equal(classifyDatabaseState({ historyExists: false, tableCount: 0 }), 'empty-bootstrap')
  assert.equal(classifyDatabaseState({ historyExists: false, tableCount: 3 }), 'refuse-populated')
  assert.equal(classifyDatabaseState({ historyExists: true, tableCount: 12 }), 'upgrade')
})

test('TC-33-17 classifies a legacy schema and archives tables without a SQL target', () => {
  const legacySchema = classifySourceSchema(['User', 'Company', 'Project', 'WorkItem', 'TimeEntry', 'Comment', 'Notification'])
  assert.equal(legacySchema.kind, 'legacy')
  assert.deepEqual(legacySchema.preserve, ['Comment', 'Notification'])
  assert.deepEqual(preservationPlan(['Comment', 'Notification']).archiveBeforeUpgrade, ['Comment', 'Notification'])
  assert.equal(classifySourceSchema(['users', 'schema_migrations']).kind, 'sql-target')
})

test('TC-33-18 reuses one live mapping and rejects a seed collision or duplicate source row', () => {
  const live = {
    sourceScope: 'live', entityName: 'work_items', oldId: 'old-1', createdAt: '2026-10-04T10:00:00.000',
    sourceChecksum: 'a'.repeat(64), targetRevision: '31.0.0', newId: '7', newPublicId: OWNER,
  }
  const planned = planConversion([{ entity: 'work_items', oldId: 'old-1', createdAt: live.createdAt }], [live], {
    sourceChecksum: 'b'.repeat(64), targetRevision: '31.0.0',
    createPublicId: () => '22222222-2222-4222-8222-222222222222',
  })
  assert.deepEqual(planned[0], live)
  const added = planConversion([{ entity: 'work_items', oldId: 'old-2', createdAt: live.createdAt }], [live], {
    sourceChecksum: 'b'.repeat(64), targetRevision: '31.0.0',
    createPublicId: () => '22222222-2222-4222-8222-222222222222',
  })
  assert.deepEqual(added[0], {
    entityName: 'work_items', sourceScope: 'live', sourceChecksum: 'b'.repeat(64), targetRevision: '31.0.0',
    oldId: 'old-2', createdAt: live.createdAt, newId: '8', newPublicId: '22222222-2222-4222-8222-222222222222',
  })
  assert.throws(() => planConversion(
    [{ entity: 'work_items', oldId: 'old-2', createdAt: live.createdAt }],
    [{ ...live, sourceScope: 'seed', oldId: 'old-2' }],
    { sourceChecksum: 'b'.repeat(64), targetRevision: '31.0.0' },
  ), /Seed mapping cannot authorize/)
  assert.throws(() => planConversion([
    { entity: 'work_items', oldId: 'old-1', createdAt: live.createdAt },
    { entity: 'work_items', oldId: 'old-1', createdAt: live.createdAt },
  ], [], { sourceChecksum: 'b'.repeat(64), targetRevision: '31.0.0' }), /Duplicate source identity/)
  const newer = classifySourceSchema(['User', 'GitLabProjectMapping', 'ExternalWorkItemReference'])
  assert.equal(newer.newer, true)
})

test('TC-33-19 lists the write freeze and identity alignment steps', () => {
  assert.deepEqual(writeFreezeChecklist().slice(0, 2), ['stop application writers', 'export the delta after the verified baseline'])
  assert.match(sequenceAlignmentStatements(['work_items'])[0], /pms_align_identity\('public\."work_items"'\)/)
  assert.throws(() => sequenceAlignmentStatements(['WorkItem']), /Unsafe identity table/)
})

test('TC-33-20 keeps the original database closed to a failed migration or owner check', () => {
  for (const failure of ['migration-halfway', 'checksum-mismatch', 'wrong-target', 'health-failed', 'owner-mismatch']) {
    const decision = recoveryDecision(failure)
    assert.equal(decision.retainOriginal, true)
    assert.equal(decision.openTarget, false)
  }
})

test('TC-33-21 plans rollback before writes and reconciliation after cutover writes', () => {
  assert.equal(rollbackPlan('before-writes').action, 'retain-original-database')
  assert.equal(rollbackPlan('before-writes').reconcile, false)
  assert.equal(rollbackPlan('after-writes').action, 'reconcile-post-cutover-writes')
  assert.equal(rollbackPlan('after-writes').reconcile, true)
})

test('TC-33-22 selects psql or pg_restore only for a verified receipt', () => {
  assert.equal(selectRestoreTool({ format: 'plain-sql-gzip', integrity: 'verified' }).tool, 'psql')
  assert.equal(selectRestoreTool({ format: 'custom-dump', integrity: 'verified' }).tool, 'pg_restore')
  assert.throws(() => selectRestoreTool({ format: 'plain-sql-gzip', integrity: 'missing' }), /not a verified/)
})

test('TC-33-23 keeps db push and JSON seed off the active startup path', () => {
  const entrypoint = readFileSync(new URL('../../scripts/docker-entrypoint-migrate.sh', import.meta.url), 'utf8')
  const manage = readFileSync(new URL('../../scripts/db-manage.sh', import.meta.url), 'utf8')
  const seed = readFileSync(new URL('../../prisma/seed.ts', import.meta.url), 'utf8')
  assert.match(entrypoint, /sql-runtime\.mjs apply/)
  assert.doesNotMatch(entrypoint, /db-push-safe\.sh|prisma db seed/)
  assert.match(manage, /Reset is refused/)
  assert.match(seed, /PMS_JSON_SEED_ISOLATED_TEST/)
  const equivalent = verifyEquivalence(
    { rows: [{ oldId: 'a' }], hours: '1.25', completed: 1, cancelled: 0, total: 2, earliest: '2026-10-01', latest: '2026-10-02' },
    { rows: [{ oldId: 'a' }], hours: '1.25', completed: 1, cancelled: 0, total: 2, earliest: '2026-10-01', latest: '2026-10-02' },
  )
  assert.equal(equivalent.equal, true)
  const duplicate = verifyEquivalence(
    { rows: [{ oldId: 'a' }, { oldId: 'b' }], hours: '1.25', completed: 1, cancelled: 0, total: 2, earliest: '2026-10-01', latest: '2026-10-02' },
    { rows: [{ oldId: 'a' }, { oldId: 'a' }], hours: '1.25', completed: 1, cancelled: 0, total: 2, earliest: '2026-10-01', latest: '2026-10-02' },
  )
  assert.equal(duplicate.equal, false)
  assert.match(duplicate.failures.join(','), /duplicate target identity a/)
  const changedField = verifyEquivalence(
    { rows: [{ oldId: 'a', logical: { hours: '1.25', projectId: 'p1' } }], hours: '1.25', completed: 1, cancelled: 0, total: 1, earliest: '2026-10-01', latest: '2026-10-01' },
    { rows: [{ oldId: 'a', id: '99', logical: { hours: '1.25', projectId: 'p2' } }], hours: '1.25', completed: 1, cancelled: 0, total: 1, earliest: '2026-10-01', latest: '2026-10-01' },
  )
  assert.equal(changedField.equal, false)
  assert.match(changedField.failures.join(','), /row data a/)
})
