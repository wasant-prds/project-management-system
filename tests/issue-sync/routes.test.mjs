import test from 'node:test'
import assert from 'node:assert/strict'
import { loader, fixture, uuid, plain } from './support.mjs'

const provider = loader()('lib/issue-sync-provider.ts')
const config = fixture()
const projectId = uuid(20)
const context = (id = projectId, configId = config.publicId) => ({ params: Promise.resolve({ id, configId }) })
const request = (body) => ({ json: async () => body })
function setup({ authorized = true, db = {}, helper = {} } = {}) {
  let credentialReads = 0
  const prisma = { project: { findUnique: async () => ({ id: 20n, publicId: projectId }) }, ...db }
  const load = loader({
    '@/lib/db': { prisma },
    'next/server': { NextResponse: { json: (body, options = {}) => ({ body: plain(body), status: options.status ?? 200, headers: options.headers }) } },
    '@/lib/owner': { getOwner: async () => { if (!authorized) throw Object.assign(new Error('denied'), { status: 401 }); return { internalId: 10n, id: uuid(10) } }, ownerErrorResponse: (error) => error.status === 401 ? { status: 401 } : null },
    '@/lib/issue-sync-provider': { ...provider,
      requiredCredential: (name, sourceProvider, baseUrl) => {
        credentialReads++
        return provider.requiredCredential(name, sourceProvider, baseUrl, { GITLAB_WORK_TOKEN: 'synthetic-secret', GITLAB_OTHER_TOKEN: 'synthetic-other-secret' })
      },
      IssueSourceClient: class { async resolveProject() { return { id: '42', path: 'group/project' } } },
    },
    ...helper,
  })
  return { load, prisma, credentialReads: () => credentialReads }
}
const collection = 'app/api/projects/[id]/issue-sync/route.ts'
const mutation = 'app/api/projects/[id]/issue-sync/[configId]/route.ts'
const syncRoute = 'app/api/projects/[id]/issue-sync/[configId]/sync/route.ts'
const historyRoute = 'app/api/projects/[id]/issue-sync/[configId]/runs/route.ts'

test('all new endpoints authenticate the owner before parsing input, checking credentials, or touching rows', async () => {
  for (const [path, method] of [[collection, 'GET'], [collection, 'POST'], [mutation, 'PATCH'], [syncRoute, 'POST'], [historyRoute, 'GET']]) {
    const app = setup({ authorized: false, db: { project: { findUnique: async () => assert.fail('database accessed before auth') } } })
    const result = await app.load(path)[method]({ json: async () => assert.fail('body parsed before auth') }, context())
    assert.equal(result.status, 401); assert.equal(app.credentialReads(), 0)
  }
})

test('public endpoints reject numeric project/config IDs and enforce the parent project boundary', async () => {
  const app = setup({ db: { issueSyncConfig: { findFirst: async ({ where }) => { assert.equal(where.mapping.projectId, 20n); return null } } } })
  assert.equal((await app.load(collection).GET({}, context('20'))).status, 400)
  assert.equal((await app.load(mutation).PATCH(request({ enabled: false }), context(projectId, '50'))).status, 400)
  assert.equal((await app.load(mutation).PATCH(request({ enabled: false }), context())).status, 404)
})

test('config listing returns explicit public DTOs and credential names without secret values or numeric keys', async () => {
  const app = setup({ db: {
    issueSyncConfig: { findMany: async ({ where }) => { assert.equal(where.mapping.projectId, 20n); return [config] } },
    gitLabProjectMapping: { findMany: async () => [{ publicId: uuid(99), provider: 'gitlab', gitLabProjectId: '99', canonicalGitLabInstanceUrl: 'https://lab.test' }] },
  } })
  const result = await app.load(collection).GET({}, context())
  assert.equal(result.status, 200); assert.equal(result.body.configs[0].id, config.publicId)
  assert.equal(result.body.legacyMappings[0].id, uuid(99)); assert.equal(result.headers['Cache-Control'], 'no-store')
  assert.equal(JSON.stringify(result.body).includes('synthetic-secret'), false)
  assert.equal(result.body.configs[0].tokenEnvVar, 'GITLAB_WORK_TOKEN')
  assert.equal('credentials' in result.body, false); assert.equal(app.credentialReads(), 0)
  assert.equal('mappingId' in result.body.configs[0], false)
})

test('config create rejects empty assignees, client IDs, tokens, invalid environment variable names, and unknown body fields', async () => {
  const app = setup()
  const valid = { provider: 'gitlab', instanceUrl: config.mapping.canonicalGitLabInstanceUrl, sourceProject: '42', tokenEnvVar: 'GITLAB_WORK_TOKEN', assignees: ['alice'], approvedLabelMap: {} }
  for (const invalid of [{ ...valid, assignees: [] }, { ...valid, token: 'do-not-store' }, { ...valid, id: uuid(999) }, { ...valid, projectId: '20' }, { ...valid, approvedLabelMap: { bug: 'admin' } }, { ...valid, tokenEnvVar: 'OWNER_GATE_PASSWORD' }, { ...valid, tokenEnvVar: 'NEXT_PUBLIC_GITHUB_TOKEN' }, { ...valid, tokenEnvVar: 'github_token' }, { ...valid, credentialRef: 'old-registry-ref' }]) {
    assert.equal((await app.load(collection).POST(request(invalid), context())).status, 400)
  }
  assert.equal((await app.load(collection).POST(request({ ...valid, tokenEnvVar: 'GITLAB_MISSING_TOKEN' }), context())).status, 503)
})

test('config create resolves a stable source ID and adopts only an existing same-project mapping', async () => {
  let saved
  const tx = {
    gitLabProjectMapping: { findUnique: async () => config.mapping, update: async ({ data }) => { assert.equal(data.firstSyncApprovedAt, null); return config.mapping } },
    externalWorkItemReference: { count: async () => 0 },
    issueSyncConfig: { create: async ({ data }) => { saved = data; return { ...config, ...data } } },
  }
  const app = setup({ db: { $transaction: async (callback) => callback(tx) } })
  const result = await app.load(collection).POST(request({ provider: 'gitlab', instanceUrl: config.mapping.canonicalGitLabInstanceUrl, sourceProject: 'group/project', tokenEnvVar: 'GITLAB_WORK_TOKEN', assignees: ['Alice', 'bob'] }), context())
  assert.equal(result.status, 201); assert.equal(saved.mappingId, 40n); assert.deepEqual(plain(saved.assignees), ['alice', 'bob'])
  assert.equal('publicId' in saved, false); assert.equal('id' in saved, false); assert.equal('token' in saved, false)
  tx.gitLabProjectMapping.findUnique = async () => ({ ...config.mapping, projectId: 999n })
  const conflict = await app.load(collection).POST(request({ provider: 'gitlab', instanceUrl: config.mapping.canonicalGitLabInstanceUrl, sourceProject: '42', tokenEnvVar: 'GITLAB_WORK_TOKEN', assignees: ['alice'] }), context())
  assert.equal(conflict.status, 409)
})

test('editing assignees resets approval, increments revision, and cannot change source or destination', async () => {
  let saved; let approvalReset = false
  const tx = {
    issueSyncConfig: { findUniqueOrThrow: async () => config, update: async ({ data }) => { saved = data; return { ...config, ...data } } },
    gitLabProjectMapping: { update: async ({ data }) => { approvalReset = data.firstSyncApprovedAt === null } },
  }
  const app = setup({ db: { issueSyncConfig: { findFirst: async () => config }, $transaction: async (callback) => callback(tx) } })
  const result = await app.load(mutation).PATCH(request({ assignees: ['bob'] }), context())
  assert.equal(result.status, 200); assert.equal(approvalReset, true); assert.equal(saved.revision.increment, 1)
  assert.equal((await app.load(mutation).PATCH(request({ sourceProject: 'other' }), context())).status, 400)
  assert.equal((await app.load(mutation).PATCH(request({ projectId: uuid(99) }), context())).status, 400)
  const changedToken = await app.load(mutation).PATCH(request({ tokenEnvVar: 'GITLAB_OTHER_TOKEN' }), context())
  assert.equal(changedToken.status, 200); assert.equal(saved.tokenEnvVar, 'GITLAB_OTHER_TOKEN'); assert.equal(approvalReset, true)
  assert.equal((await app.load(mutation).PATCH(request({ tokenEnvVar: 'GITLAB_MISSING_TOKEN' }), context())).status, 503)
  tx.issueSyncConfig.findUniqueOrThrow = async () => ({ ...config, leaseUntil: new Date(Date.now() + 8 * 3600_000) })
  assert.equal((await app.load(mutation).PATCH(request({ enabled: false }), context())).status, 409)
})

test('disabled configs can be configured before their token exists and cannot be enabled until it is available', async () => {
  const paused = { ...config, enabled: false, tokenEnvVar: null }
  let saved
  const tx = {
    issueSyncConfig: { findUniqueOrThrow: async () => paused, update: async ({ data }) => { saved = data; return { ...paused, ...data } } },
    gitLabProjectMapping: { update: async () => paused.mapping },
  }
  const app = setup({ db: { issueSyncConfig: { findFirst: async () => paused }, $transaction: async (callback) => callback(tx) } })
  const handler = app.load(mutation).PATCH
  const response = await handler(request({ tokenEnvVar: 'GITLAB_NOT_YET_PROVISIONED_TOKEN' }), context())
  assert.equal(response.status, 200); assert.equal(saved.enabled, false); assert.equal(app.credentialReads(), 0)
  assert.equal((await handler(request({ enabled: true }), context())).status, 400)
  paused.tokenEnvVar = 'GITLAB_MISSING_TOKEN'
  assert.equal((await handler(request({ enabled: true }), context())).status, 503)
  assert.equal((await handler(request({ enabled: false }), context())).status, 200)
  assert.equal((await handler(request({ enabled: false, tokenEnvVar: 'OWNER_GATE_PASSWORD' }), context())).status, 400)
})

test('run history pagination scopes public cursors to the config without exposing internal row IDs', async () => {
  const run = { id: 88n, publicId: uuid(88), configId: 50n, status: 'success', configSnapshot: { assignees: ['alice'] }, results: [], runError: null, createdCount: 1, updatedCount: 0, skippedCount: 0, failedCount: 0, createdAt: new Date('2026-11-03T12:00:00Z'), finishedAt: new Date('2026-11-03T12:01:00Z') }
  const app = setup({ db: {
    issueSyncConfig: { findFirst: async () => config },
    issueSyncRun: { findFirst: async ({ where }) => { assert.equal(where.configId, 50n); return { id: 89n } }, findMany: async ({ where, take }) => { assert.equal(where.configId, 50n); if (where.id) assert.equal(where.id.lt, 89n); assert.equal(take, 2); return [run, { ...run, id: 87n, publicId: uuid(87) }] } },
  } })
  const handler = app.load(historyRoute).GET
  assert.equal((await handler({ url: 'https://pms.test/runs?before=88' }, context())).status, 400)
  assert.equal((await handler({ url: 'https://pms.test/runs?limit=51' }, context())).status, 400)
  const result = await handler({ url: `https://pms.test/runs?limit=1&before=${uuid(89)}` }, context())
  assert.equal(result.status, 200); assert.equal(result.body.nextBefore, uuid(88)); assert.equal(result.body.runs[0].id, uuid(88)); assert.equal('configId' in result.body.runs[0], false)
})

test('manual sync validates approval and delegates only the server-resolved owner and config', async () => {
  let ownerSent
  const app = setup({ db: { issueSyncConfig: { findFirst: async () => config } }, helper: {
    '@/lib/issue-sync': { startIssueSync: async (_db, sent, approve) => { assert.equal(sent, config); assert.equal(approve, true); return { id: 99n } }, executeIssueSync: async (_db, sent, _run, owner) => { ownerSent = owner; return { publicId: uuid(99) } }, syncRunDto: (run) => ({ id: run.publicId }) },
  } })
  const handler = app.load(syncRoute).POST
  assert.equal((await handler(request({ approveFirstSync: 'true' }), context())).status, 400)
  assert.equal((await handler(request({ approveFirstSync: true, assigneeId: uuid(999) }), context())).status, 400)
  const result = await handler(request({ approveFirstSync: true }), context())
  assert.equal(result.status, 200); assert.equal(result.body.run.id, uuid(99)); assert.equal(ownerSent, 10n)
})
