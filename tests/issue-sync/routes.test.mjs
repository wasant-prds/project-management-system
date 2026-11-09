import test from 'node:test'
import assert from 'node:assert/strict'
import { loader, fixture, uuid, plain } from './support.mjs'
const provider = loader()('lib/issue-sync-provider.ts')
const projectId = uuid(20)
const context = (id = projectId, configId = uuid(50)) => ({ params: Promise.resolve({ id, configId }) })
const request = (body) => ({ json: async () => body })
const collection = 'app/api/projects/[id]/issue-sync/route.ts'
const mutation = 'app/api/projects/[id]/issue-sync/[configId]/route.ts'
const syncRoute = 'app/api/projects/[id]/issue-sync/[configId]/sync/route.ts'
const historyRoute = 'app/api/projects/[id]/issue-sync/[configId]/runs/route.ts'
const confirmRoute = 'app/api/projects/[id]/issue-sync/[configId]/confirm/route.ts'
function setup({ authorized = true, found = true, config = fixture(), repos = {}, helper = {} } = {}) {
  const calls = { credentials: 0, project: 0, config: 0, updates: [], mappingUpdates: [] }
  const storage = {
    syncConfigs: {
      byPublicId: async (_id, parent) => {
        calls.config++
        assert.equal(parent, 20n)
        return found ? config : null
      },
      byId: async () => config,
      list: async (parent) => {
        assert.equal(parent, 20n)
        return [config]
      },
      create: async (data) => {
        calls.created = data
        return { ...config, ...data }
      },
      update: async (_id, data) => {
        calls.updates.push(data)
        return { ...config, ...data }
      },
    },
    mappings: {
      bySource: async () => config.mapping,
      legacy: async () => [{ ...config.mapping, publicId: uuid(99) }],
      update: async (_id, data) => {
        calls.mappingUpdates.push(data)
        return { ...config.mapping, ...data }
      },
    },
    sourceReferences: { conflicts: async () => 0 },
    syncRuns: { byPublicId: async () => null, list: async () => [] },
    ...repos,
  }
  const load = loader({
    '@/lib/database/client': { database: { transaction: async (operation) => operation({}) } },
    '@/lib/database/repositories/projects': {
      projects: {
        byPublicId: async () => {
          calls.project++
          return { id: 20n, publicId: projectId }
        },
      },
    },
    '@/lib/database/repositories/issue-sync': storage,
    'next/server': {
      NextResponse: {
        json: (body, options = {}) => ({
          body: plain(body),
          status: options.status ?? 200,
          headers: options.headers,
        }),
      },
    },
    '@/lib/owner': {
      getOwner: async () => {
        if (!authorized) throw Object.assign(new Error('denied'), { status: 401 })
        return { internalId: 10n, id: uuid(10) }
      },
      ownerErrorResponse: (error) => (error.status === 401 ? { status: 401 } : null),
    },
    '@/lib/issue-sync-provider': {
      ...provider,
      requiredCredential: (name, source, base) => {
        calls.credentials++
        return provider.requiredCredential(name, source, base, {
          GITLAB_WORK_TOKEN: 'synthetic-secret',
          GITLAB_OTHER_TOKEN: 'synthetic-other',
        })
      },
      IssueSourceClient: class {
        async resolveProject() {
          return { id: '42', path: 'group/project' }
        }
      },
    },
    ...helper,
  })
  return { load, calls, storage }
}

test('project sync endpoints authenticate before input parsing, credentials and database access', async () => {
  for (const [path, method] of [
    [collection, 'GET'],
    [collection, 'POST'],
    [mutation, 'PATCH'],
    [syncRoute, 'POST'],
    [historyRoute, 'GET'],
    [confirmRoute, 'POST'],
  ]) {
    const app = setup({ authorized: false })
    assert.equal(
      (await app.load(path)[method]({ json: async () => assert.fail('body read before auth') }, context()))
        .status,
      401,
    )
    assert.equal(app.calls.project, 0)
    assert.equal(app.calls.credentials, 0)
  }
})
test('sync endpoints reject numeric identifiers and scope configurations to the parent Project', async () => {
  const app = setup({ found: false })
  assert.equal((await app.load(collection).GET({}, context('20'))).status, 400)
  assert.equal(
    (await app.load(mutation).PATCH(request({ enabled: false }), context(projectId, '50'))).status,
    400,
  )
  assert.equal((await app.load(mutation).PATCH(request({ enabled: false }), context())).status, 404)
})
test('config lists expose public UUIDs and token variable names without secret values or internal keys', async () => {
  const app = setup(),
    response = await app.load(collection).GET({}, context())
  assert.equal(response.status, 200)
  assert.equal(response.body.configs[0].id, uuid(50))
  assert.equal(response.body.configs[0].tokenEnvVar, 'GITLAB_WORK_TOKEN')
  assert.equal(response.body.legacyMappings[0].id, uuid(99))
  assert.equal(response.headers['Cache-Control'], 'no-store')
  assert.equal(app.calls.credentials, 0)
  assert.doesNotMatch(JSON.stringify(response.body), /synthetic-secret|mappingId|leaseToken/)
})

test('provider authentication failures retain upstream diagnostics without triggering owner authentication', async () => {
  const failure = { provider: 'gitlab', operation: 'resolve_project', httpStatus: 401 }
  const app = setup({
    repos: {
      syncConfigs: {
        list: async () => {
          throw new provider.IssueSyncError(
            'PROVIDER_UNAUTHORIZED',
            'GitLab HTTP 401: ตรวจตัวแปร token',
            503,
            false,
            failure,
          )
        },
      },
    },
  })
  const result = await app.load(collection).GET({}, context())
  assert.equal(result.status, 503)
  assert.equal(result.body.error.code, 'PROVIDER_UNAUTHORIZED')
  assert.deepEqual(result.body.error.providerFailure, failure)
})
const valid = {
  provider: 'gitlab',
  instanceUrl: 'https://gitlab.example.test/base',
  sourceProject: 'group/project',
  tokenEnvVar: 'GITLAB_WORK_TOKEN',
  assignees: ['alice'],
}
for (const patch of [
  { assignees: [] },
  { token: 'secret' },
  { id: uuid(9) },
  { projectId: '20' },
  { approvedLabelMap: { bug: 'admin' } },
  { tokenEnvVar: 'OWNER_GATE_PASSWORD' },
  { tokenEnvVar: 'NEXT_PUBLIC_GITHUB_TOKEN' },
  { tokenEnvVar: 'github_token' },
  { credentialRef: 'old-registry-ref' },
])
  test(`config creation rejects ${Object.keys(patch).join(',')}: ${JSON.stringify(patch)}`, async () => {
    const app = setup()
    assert.equal((await app.load(collection).POST(request({ ...valid, ...patch }), context())).status, 400)
  })
test('create resolves stable source identity and adopts only a same-project mapping', async () => {
  const app = setup()
  const result = await app
    .load(collection)
    .POST(request({ ...valid, assignees: ['Alice', 'bob'] }), context())
  assert.equal(result.status, 201)
  assert.equal(app.calls.created.mappingId, 40n)
  assert.deepEqual(plain(app.calls.created.assignees), ['alice', 'bob'])
  assert.equal('publicId' in app.calls.created, false)
  app.storage.mappings.bySource = async () => ({ ...fixture().mapping, projectId: 999n })
  assert.equal((await app.load(collection).POST(request(valid), context())).status, 409)
})
test('policy edits reset approval, increment revision and prevent source or destination changes', async () => {
  const app = setup(),
    handler = app.load(mutation).PATCH
  assert.equal((await handler(request({ assignees: ['bob'] }), context())).status, 200)
  assert.equal(app.calls.updates[0].revision, 1)
  assert.equal(app.calls.mappingUpdates[0].firstSyncApprovedAt, null)
  for (const body of [{ sourceProject: 'other' }, { projectId: uuid(99) }])
    assert.equal((await handler(request(body), context())).status, 400)
  assert.equal((await handler(request({ tokenEnvVar: 'GITLAB_OTHER_TOKEN' }), context())).status, 200)
  assert.equal(app.calls.updates.at(-1).tokenEnvVar, 'GITLAB_OTHER_TOKEN')
  assert.equal((await handler(request({ tokenEnvVar: 'GITLAB_MISSING_TOKEN' }), context())).status, 503)
  app.storage.syncConfigs.byId = async () => ({
    ...fixture(),
    leaseUntil: new Date(Date.now() + 8 * 3600_000),
  })
  assert.equal((await handler(request({ enabled: false }), context())).status, 409)
})
test('paused configs allow a token name before provisioning, and enabling checks availability', async () => {
  const config = { ...fixture(), enabled: false, tokenEnvVar: null },
    app = setup({ config }),
    handler = app.load(mutation).PATCH
  assert.equal((await handler(request({ tokenEnvVar: 'GITLAB_FUTURE_TOKEN' }), context())).status, 200)
  assert.equal(app.calls.credentials, 0)
  assert.equal((await handler(request({ enabled: true }), context())).status, 400)
  config.tokenEnvVar = 'GITLAB_MISSING_TOKEN'
  assert.equal((await handler(request({ enabled: true }), context())).status, 503)
  assert.equal((await handler(request({ enabled: false }), context())).status, 200)
})
test('history scopes UUID pagination to a config and never exposes numeric row keys', async () => {
  const run = {
    id: 88n,
    publicId: uuid(88),
    status: 'success',
    configSnapshot: {},
    results: [],
    runError: null,
    createdCount: 1,
    updatedCount: 0,
    skippedCount: 0,
    failedCount: 0,
    createdAt: new Date('2026-11-03Z'),
    finishedAt: null,
  }
  const app = setup({
    repos: {
      syncRuns: {
        byPublicId: async (_id, parent) => {
          assert.equal(parent, 50n)
          return { id: 89n }
        },
        list: async (parent, limit, before) => {
          assert.equal(parent, 50n)
          assert.equal(limit, 2)
          assert.equal(before, 89n)
          return [run, { ...run, id: 87n, publicId: uuid(87) }]
        },
      },
    },
  })
  const handler = app.load(historyRoute).GET
  assert.equal((await handler({ url: 'https://pms.test/runs?before=88' }, context())).status, 400)
  assert.equal((await handler({ url: 'https://pms.test/runs?limit=51' }, context())).status, 400)
  const response = await handler({ url: `https://pms.test/runs?limit=1&before=${uuid(89)}` }, context())
  assert.equal(response.status, 200)
  assert.equal(response.body.nextBefore, uuid(88))
  assert.equal('configId' in response.body.runs[0], false)
})
test('manual sync passes only the server-resolved config and owner after validating approval', async () => {
  let ownerSent
  const app = setup({
    helper: {
      '@/lib/issue-sync': {
        startIssueSync: async (_db, config, approved) => {
          assert.equal(config.publicId, uuid(50))
          assert.equal(approved, true)
          return { id: 99n }
        },
        executeIssueSync: async (_db, _config, _run, owner) => {
          ownerSent = owner
          return { publicId: uuid(99) }
        },
        syncRunDto: (run) => ({ id: run.publicId }),
      },
    },
  })
  const handler = app.load(syncRoute).POST
  assert.equal((await handler(request({ approveFirstSync: 'true' }), context())).status, 400)
  assert.equal(
    (await handler(request({ approveFirstSync: true, assigneeId: uuid(999) }), context())).status,
    400,
  )
  const result = await handler(request({ approveFirstSync: true }), context())
  assert.equal(result.status, 200)
  assert.equal(result.body.run.id, uuid(99))
  assert.equal(ownerSent, 10n)
})

test('confirmation validates public UUIDs and exact body fields before resolving server-owned snapshots', async () => {
  let captured
  const app = setup({
    helper: {
      '@/lib/issue-sync': {
        confirmIssueSync: async (_db, config, runId, owner, decisions) => {
          captured = { config, runId, owner, decisions }
          return { publicId: uuid(101) }
        },
        syncRunDto: (run) => ({ id: run.publicId }),
      },
    },
  })
  const handler = app.load(confirmRoute).POST
  const valid = { runId: uuid(101), decisions: [{ issueId: '701', workItemId: uuid(200) }] }
  for (const body of [
    { ...valid, runId: '101' },
    { ...valid, decisions: [] },
    { ...valid, token: 'forbidden' },
    { ...valid, decisions: [{ issueId: '701', workItemId: '200' }] },
    { ...valid, decisions: [{ issueId: '701', workItemId: null, source: {} }] },
  ])
    assert.equal((await handler(request(body), context())).status, 400)
  const response = await handler(request(valid), context())
  assert.equal(response.status, 200)
  assert.equal(captured.owner, 10n)
  assert.equal(captured.config.publicId, uuid(50))
  assert.deepEqual(plain(captured.decisions), valid.decisions)
  assert.equal(app.calls.credentials, 0)
})
