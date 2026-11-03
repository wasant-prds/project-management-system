import test from 'node:test'
import assert from 'node:assert/strict'
import { loader, fixture, rawIssue, database, plain, uuid } from './support.mjs'

const load = loader()
const { IssueSourceClient, IssueSyncError } = load('lib/issue-sync-provider.ts')
const { executeIssueSync, startIssueSync, syncConfigDto, syncRunDto } = load('lib/issue-sync.ts')
const owner = 10n

function sourceClient(config, rows, { absent = [], error, resolvedId = '42' } = {}) {
  const client = new IssueSourceClient({ ref: 'work', provider: config.mapping.provider, baseUrl: config.mapping.canonicalGitLabInstanceUrl, token: 'synthetic-secret' })
  client.resolveProject = async () => ({ id: resolvedId, path: config.sourceProjectPath })
  client.issues = async function* () { for (const row of rows) yield row; if (error) throw error }
  client.issue = async (_source, number) => { const issue = absent.find((row) => String(row.iid ?? row.number) === number); if (!issue) throw new IssueSyncError('PROVIDER_UNAVAILABLE', 'ตรวจ issue เดิมไม่ได้', 503, true); return issue }
  return client
}
async function sync(fx, rows, options = {}) {
  const config = structuredClone(fx.state.config)
  const run = await startIssueSync(fx.db, config, options.approve ?? false)
  return executeIssueSync(fx.db, config, run, owner, sourceClient(config, rows, options))
}

for (const provider of ['gitlab', 'github']) {
  test(`${provider}: repeat sync preserves public IDs, owner, PMS fields, and creates durable run history`, async () => {
    const fx = database(fixture(provider))
    const first = await sync(fx, [rawIssue(provider)])
    assert.equal(first.status, 'success'); assert.equal(first.createdCount, 1)
    assert.equal(fx.state.items.length, 1); assert.equal(fx.state.references.length, 1)
    const originalId = fx.state.items[0].publicId
    fx.mutate((state) => Object.assign(state.items[0], { priority: 'urgent', role: 'infra', workDate: new Date('2026-11-03'), dailyWork: [{ hours: '3.25' }] }))
    const repeated = await sync(fx, [rawIssue(provider)])
    assert.equal(repeated.skippedCount, 1); assert.equal(fx.state.items.length, 1)
    const updated = await sync(fx, [rawIssue(provider, { title: 'Changed title', state: 'closed', updated_at: '2026-10-03T02:00:00Z' })])
    assert.equal(updated.updatedCount, 1)
    const item = fx.state.items[0]
    assert.equal(item.publicId, originalId); assert.equal(item.status, 'completed'); assert.equal(item.assigneeId, owner)
    assert.equal(item.priority, 'urgent'); assert.equal(item.role, 'infra'); assert.equal(item.workDate.toISOString().slice(0, 10), '2026-11-03')
    assert.deepEqual(item.dailyWork, [{ hours: '3.25' }]); assert.equal(fx.state.runs.length, 3)
    assert.equal(fx.state.config.leaseToken, null); assert.equal(fx.state.config.leaseUntil, null)
    const dto = syncRunDto(updated)
    assert.match(dto.id, /^10000000-/); assert.equal(dto.startedAt.endsWith('+07:00'), true)
    const encoded = JSON.stringify(dto)
    assert.equal(encoded.includes('synthetic-secret'), false); assert.equal(encoded.includes('workItemId":'+String(item.id)), false)
  })

  test(`${provider}: missing and nonmatching assignees never create work items, even if the provider ignores the filter`, async () => {
    const fx = database(fixture(provider))
    const rows = [rawIssue(provider, { assignees: [] }), rawIssue(provider, { id: 702, assignees: provider === 'github' ? [{ login: 'charlie' }] : [{ username: 'charlie' }] })]
    const run = await sync(fx, rows)
    assert.equal(run.skippedCount, 2); assert.equal(run.createdCount, 0); assert.equal(fx.state.items.length, 0)
    assert.ok(run.results.every((result) => result.reason === 'assignee_not_matched'))
  })

  test(`${provider}: confirmed reassignment freezes source fields, records out-of-scope, and resumes using the same UUID`, async () => {
    const fx = database(fixture(provider))
    await sync(fx, [rawIssue(provider)])
    const id = fx.state.items[0].publicId
    const reassigned = rawIssue(provider, { title: 'Do not import this change', updated_at: '2026-10-04T02:00:00Z', assignees: [] })
    const run = await sync(fx, [], { absent: [reassigned] })
    assert.equal(run.results[0].reason, 'out_of_scope'); assert.equal(fx.state.references[0].inScope, false)
    assert.equal(fx.state.items[0].title, 'Fix login'); assert.equal(fx.state.items[0].publicId, id)
    await sync(fx, [rawIssue(provider)]) // old matching snapshot cannot undo reassignment
    assert.equal(fx.state.references[0].inScope, false)
    await sync(fx, [rawIssue(provider, { title: 'Reassigned back', updated_at: '2026-10-05T02:00:00Z' })])
    assert.equal(fx.state.references[0].inScope, true); assert.equal(fx.state.items[0].title, 'Reassigned back'); assert.equal(fx.state.items[0].publicId, id)
  })
}

test('a missing issue or provider failure never implies out-of-scope and keeps partial committed history', async () => {
  const fx = database()
  await sync(fx, [rawIssue()])
  const failed = await sync(fx, [], { error: new IssueSyncError('RATE_LIMITED', 'จำกัดคำขอ', 503, true) })
  assert.equal(failed.status, 'failed'); assert.equal(failed.runError.code, 'RATE_LIMITED'); assert.equal(fx.state.references[0].inScope, true)
  const partial = await sync(fx, [rawIssue('gitlab', { id: 702, iid: 18, web_url: 'https://gitlab.example.test/base/group/project/-/issues/18' })], { error: new IssueSyncError('RATE_LIMITED', 'จำกัดคำขอ', 503, true) })
  assert.equal(partial.status, 'partial'); assert.equal(partial.createdCount, 1); assert.equal(fx.state.items.length, 2)
  assert.equal(fx.state.runs.at(-1).results.length, 1)
})

test('unchanged and out-of-scope items retain due dates unsupported by GitHub', async () => {
  const fx = database(fixture('github'))
  await sync(fx, [rawIssue('github')])
  fx.mutate((state) => { state.items[0].dueDate = new Date('2026-12-31T00:00:00Z') })
  await sync(fx, [rawIssue('github', { title: 'New title' })])
  assert.equal(fx.state.items[0].dueDate.toISOString(), '2026-12-31T00:00:00.000Z')
})

test('first-sync approval is required and config without assignees or disabled cannot start', async () => {
  for (const change of [{ assignees: [] }, { enabled: false }]) {
    const config = { ...fixture(), ...change }; const fx = database(config)
    await assert.rejects(startIssueSync(fx.db, config, true), (error) => error.code === 'CONFIG_DISABLED')
    assert.equal(fx.state.runs.length, 0)
  }
  const config = fixture(); config.mapping.firstSyncApprovedAt = null
  const fx = database(config)
  await assert.rejects(startIssueSync(fx.db, config, false), (error) => error.code === 'FIRST_SYNC_APPROVAL_REQUIRED')
  const run = await sync(fx, [rawIssue()], { approve: true })
  assert.equal(run.createdCount, 1); assert.ok(fx.state.config.mapping.firstSyncApprovedAt)
})

test('one config cannot run concurrently and an expired lease records interruption before retry', async () => {
  const fx = database(); const config = structuredClone(fx.state.config)
  const run = await startIssueSync(fx.db, config, false)
  await assert.rejects(startIssueSync(fx.db, config, false), (error) => error.code === 'SYNC_IN_PROGRESS')
  fx.mutate((state) => { state.config.leaseUntil = new Date('2020-01-01') })
  const retry = await startIssueSync(fx.db, structuredClone(fx.state.config), false)
  assert.notEqual(retry.publicId, run.publicId); assert.equal(fx.state.runs[0].status, 'failed'); assert.equal(fx.state.runs[0].runError.code, 'INTERRUPTED')
})

test('config edits and source identity changes stop writes safely', async () => {
  const fx = database(); const config = structuredClone(fx.state.config); const run = await startIssueSync(fx.db, config, false)
  fx.mutate((state) => { state.config.revision++ })
  const result = await executeIssueSync(fx.db, config, run, owner, sourceClient(config, [rawIssue()]))
  assert.equal(result.runError.code, 'CONFIG_CHANGED'); assert.equal(fx.state.items.length, 0)
  const other = database(); const identityChanged = await sync(other, [rawIssue()], { resolvedId: '43' })
  assert.equal(identityChanged.runError.code, 'SOURCE_IDENTITY_CHANGED'); assert.equal(other.state.items.length, 0)
})

test('foreign owner and destination conflicts cannot modify existing work items', async () => {
  for (const change of [{ assigneeId: 99n }, { projectId: 99n }]) {
    const fx = database(); await sync(fx, [rawIssue()]); fx.mutate((state) => Object.assign(state.items[0], change))
    const result = await sync(fx, [rawIssue('gitlab', { title: 'Unauthorized change' })])
    assert.equal(result.failedCount, 1); assert.equal(result.results[0].reason, 'SOURCE_IDENTITY_CONFLICT'); assert.equal(fx.state.items[0].title, 'Fix login')
  }
})

test('an identity mismatch on known-issue lookup cannot freeze or overwrite another issue', async () => {
  const fx = database(); await sync(fx, [rawIssue()])
  const run = await sync(fx, [], { absent: [rawIssue('gitlab', { id: 999, assignees: [] })] })
  assert.equal(run.failedCount, 1); assert.equal(fx.state.references[0].inScope, true)
})

test('config and run DTOs expose UUIDs and explicit safe fields without internal keys or lease tokens', () => {
  const config = fixture(); config.leaseToken = uuid(777)
  const dto = syncConfigDto(config)
  assert.equal(dto.id, config.publicId); assert.equal('mappingId' in dto, false); assert.equal('projectId' in dto, false); assert.equal('leaseToken' in dto, false)
  assert.equal(JSON.stringify(dto).includes(uuid(777)), false)
})

test('an expired old process cannot overwrite interrupted history or release the replacement lease', async () => {
  const fx = database()
  const config = structuredClone(fx.state.config)
  const oldRun = await startIssueSync(fx.db, config, false)
  fx.mutate((state) => { state.config.leaseUntil = new Date('2020-01-01') })
  const replacement = await startIssueSync(fx.db, structuredClone(fx.state.config), false)
  const finishedOld = await executeIssueSync(fx.db, config, oldRun, owner, sourceClient(config, [rawIssue()]))
  assert.equal(finishedOld.status, 'failed')
  assert.equal(finishedOld.runError.code, 'INTERRUPTED')
  assert.equal(fx.state.config.leaseToken, replacement.publicId)
  assert.equal(fx.state.items.length, 0)
})
