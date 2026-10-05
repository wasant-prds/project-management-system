import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import test from 'node:test'
import vm from 'node:vm'
import { resolveTestImport } from '../support/identity-modules.mjs'

const require = createRequire(import.meta.url)
const ts = require('typescript')
const config = { baseUrl: 'https://gitlab.example.test/base', token: 'synthetic-private-token' }
const OWNER_PUBLIC = '11111111-1111-4111-8111-111111111111'
const PROJECT_PUBLIC = '33333333-3333-4333-8333-333333333333'
const OTHER_PROJECT_PUBLIC = '44444444-4444-4444-8444-444444444444'
const COMPANY_PUBLIC = '55555555-5555-4555-8555-555555555555'
const MAPPING_PUBLIC = '88888888-8888-4888-8888-888888888888'
const owner = { id: OWNER_PUBLIC, internalId: 7n, name: 'Owner' }

function loadTs(path, mocks) {
  const source = readFileSync(new URL(path, import.meta.url), 'utf8')
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText
  const loaded = { exports: {} }
  vm.runInNewContext(output, {
    module: loaded,
    exports: loaded.exports,
    require: (name) => {
      const resolved = resolveTestImport(name, mocks)
      if (resolved === undefined) throw new Error(`Unexpected import: ${name}`)
      return resolved
    },
    Date,
    URL,
    Buffer,
    process,
    console: { error() {} },
  }, { filename: path })
  return loaded.exports
}

function makeResponse(body, status = 200, headers = {}) {
  return { status, body, headers }
}

function makeOwnerMocks({ authorized = true, gitLabConfigured = true } = {}) {
  let ownerCalls = 0
  let configurationCalls = 0
  return {
    '@/lib/owner': {
      async getOwner() {
        ownerCalls += 1
        if (!authorized) throw Object.assign(new Error('unauthorized'), { status: 401 })
        return owner
      },
      ownerErrorResponse(error) {
        return error?.status === 401
          ? makeResponse({ error: { code: 'OWNER_UNAUTHENTICATED', message: 'owner required' } }, 401)
          : null
      },
      calls: () => ownerCalls,
    },
    'next/server': {
      NextResponse: { json: (body, options = {}) => makeResponse(body, options.status ?? 200, options.headers ?? {}) },
    },
    'node:crypto': require('node:crypto'),
    '@/lib/bangkok-datetime': { serializeBangkokTimestamp: (value) => `${value.toISOString().slice(0, -1)}+07:00`, currentBangkokWallClockDate: () => new Date('2026-09-30T18:00:00.000Z') },
    '@/lib/gitlab-issue-import': {
      getGitLabConfiguration() { configurationCalls += 1; return gitLabConfigured ? config : null },
      configurationCalls: () => configurationCalls,
      validateApprovedLabelMap: (value) => value && typeof value === 'object' && !Array.isArray(value)
        && Object.values(value).every((entry) => ['bug', 'feature'].includes(entry)) ? value : null,
      GitLabProviderError: class GitLabProviderError extends Error { constructor(code, message) { super(message); this.code = code } },
      syncGitLabProject: async (args) => ({ counts: { created: 1, updated: 0, skipped: 0, failed: 0 }, results: [{ outcome: 'created', sourceUrl: 'https://gitlab.example.test/base/group/project/-/issues/17' }], ownerId: args.ownerId }),
    },
    '@/lib/db': { prisma: {} },
  }
}

const project = {
  id: 1n, publicId: PROJECT_PUBLIC, name: 'Project One',
  company: { id: 11n, publicId: COMPANY_PUBLIC, name: 'Company One', displayName: null },
}
const mapping = {
  id: 5n, publicId: MAPPING_PUBLIC, provider: 'gitlab', canonicalGitLabInstanceUrl: config.baseUrl, gitLabProjectId: '42', projectId: project.id,
  approvedLabelMap: { bug: 'bug' }, firstSyncApprovedAt: null,
  createdAt: new Date('2026-09-30T17:00:00.000Z'), updatedAt: new Date('2026-09-30T17:00:00.000Z'), project,
}

test('owner authentication protects GitLab status before configuration details are read', async () => {
  const mocks = makeOwnerMocks({ authorized: false })
  const db = { project: {}, gitLabProjectMapping: {}, externalWorkItemReference: {} }
  mocks['@/lib/db'].prisma = db
  const { GET } = loadTs('../../app/api/integrations/gitlab/status/route.ts', mocks)
  const result = await GET()
  assert.equal(result.status, 401)
  assert.equal(mocks['@/lib/owner'].calls(), 1)
  assert.equal(mocks['@/lib/gitlab-issue-import'].configurationCalls(), 0)
  assert.equal(JSON.stringify(result.body).includes(config.token), false)
})

test('GitLab status returns only the configured flag for configured and unconfigured secrets', async () => {
  for (const gitLabConfigured of [true, false]) {
    const mocks = makeOwnerMocks({ gitLabConfigured })
    const { GET } = loadTs('../../app/api/integrations/gitlab/status/route.ts', mocks)
    const result = await GET()

    assert.equal(result.status, 200)
    assert.equal(result.body.configured, gitLabConfigured)
    assert.deepEqual(Object.keys(result.body), ['configured'])
    assert.equal(JSON.stringify(result.body).includes(config.token), false)
    assert.equal(mocks['@/lib/gitlab-issue-import'].configurationCalls(), 1)
  }
})

test('all GitLab mapping routes reject unauthenticated access before database reads or writes', async () => {
  const mocks = makeOwnerMocks({ authorized: false })
  const prisma = {
    gitLabProjectMapping: {
      async findMany() { assert.fail('must not list mappings before owner authorization') },
      async create() { assert.fail('must not create mappings before owner authorization') },
      async findUnique() { assert.fail('must not read a mapping before owner authorization') },
      async update() { assert.fail('must not update mappings before owner authorization') },
      async delete() { assert.fail('must not delete mappings before owner authorization') },
    },
    project: { async findUnique() { assert.fail('must not read Projects before owner authorization') } },
    externalWorkItemReference: {
      async findFirst() { assert.fail('must not read references before owner authorization') },
      async count() { assert.fail('must not count references before owner authorization') },
    },
  }
  mocks['@/lib/db'].prisma = prisma
  const { GET, POST } = loadTs('../../app/api/integrations/gitlab/projects/route.ts', mocks)
  const itemRoutes = loadTs('../../app/api/integrations/gitlab/projects/[mappingId]/route.ts', mocks)
  const request = { json: async () => assert.fail('must not parse mapping bodies before owner authorization') }
  const context = { params: Promise.resolve({ mappingId: mapping.id }) }
  const results = [
    await GET(),
    await POST(request),
    await itemRoutes.PATCH(request, context),
    await itemRoutes.DELETE({}, context),
  ]

  assert.deepEqual(results.map((result) => result.status), [401, 401, 401, 401])
  assert.ok(results.every((result) => result.body.error.code === 'OWNER_UNAUTHENTICATED'))
  assert.equal(mocks['@/lib/owner'].calls(), 4)
  assert.equal(mocks['@/lib/gitlab-issue-import'].configurationCalls(), 0)
})

test('mapping create uses only server-configured instance and rejects client URL or secret fields', async () => {
  let createData
  const mocks = makeOwnerMocks()
  mocks['@/lib/db'].prisma = {
    project: { async findUnique() { return { id: 1n } } },
    externalWorkItemReference: { async findFirst() { return null } },
    gitLabProjectMapping: {
      async create({ data }) { createData = data; return { ...mapping, ...data } },
    },
  }
  const { POST } = loadTs('../../app/api/integrations/gitlab/projects/route.ts', mocks)
  const invalid = await POST({ json: async () => ({ gitLabProjectId: '42', projectId: PROJECT_PUBLIC, approvedLabelMap: {}, instanceUrl: 'https://attacker.invalid', token: 'leak' }) })
  assert.equal(invalid.status, 400)
  const created = await POST({ json: async () => ({ gitLabProjectId: '42', projectId: PROJECT_PUBLIC, approvedLabelMap: { bug: 'bug' } }) })
  assert.equal(created.status, 201)
  assert.equal(createData.canonicalGitLabInstanceUrl, config.baseUrl)
  assert.equal(createData.gitLabProjectId, '42')
  assert.equal(JSON.stringify(created.body).includes(config.token), false)
})

test('mapping creation rejects rebinding an imported source Project to a different PMS Project', async () => {
  const mocks = makeOwnerMocks()
  mocks['@/lib/db'].prisma = {
    project: { async findUnique() { return { id: 2n } } },
    externalWorkItemReference: { async findFirst({ where }) { return { id: 'reference-1', ...where } } },
    gitLabProjectMapping: { async create() { assert.fail('must not create a conflicting mapping') } },
  }
  const { POST } = loadTs('../../app/api/integrations/gitlab/projects/route.ts', mocks)
  const result = await POST({ json: async () => ({ gitLabProjectId: '42', projectId: OTHER_PROJECT_PUBLIC, approvedLabelMap: {} }) })
  assert.equal(result.status, 409)
  assert.equal(result.body.error.code, 'CONFLICT')
})

test('mapping edit blocks destination moves with references and resets first-sync approval on approved label changes', async () => {
  const mocks = makeOwnerMocks()
  let updateData
  let referenceCountWhere
  let transactionOptions
  let failTransaction = false
  const db = {
    project: { async findUnique() { return { id: 2n } } },
    gitLabProjectMapping: {
      async findFirst() { return { ...mapping, approvedLabelMap: { bug: 'bug' } } },
      async update(args) { updateData = args.data; return { ...mapping, ...args.data } },
    },
    externalWorkItemReference: { async count({ where }) { referenceCountWhere = where; return 1 } },
    async $transaction(callback, options) {
      transactionOptions = options
      if (failTransaction) throw Object.assign(new Error('serialization conflict'), { code: 'P2034' })
      return callback(db)
    },
  }
  mocks['@/lib/db'].prisma = db
  const { PATCH } = loadTs('../../app/api/integrations/gitlab/projects/[mappingId]/route.ts', mocks)
  const moved = await PATCH({ json: async () => ({ projectId: OTHER_PROJECT_PUBLIC }) }, { params: Promise.resolve({ mappingId: MAPPING_PUBLIC }) })
  assert.equal(moved.status, 409)
  assert.equal(referenceCountWhere.provider, 'gitlab')
  assert.equal(referenceCountWhere.canonicalGitLabInstanceUrl, config.baseUrl)
  assert.equal(referenceCountWhere.gitLabProjectId, '42')
  assert.equal(transactionOptions.isolationLevel, 'Serializable')
  assert.equal(updateData, undefined)

  mocks['@/lib/db'].prisma.externalWorkItemReference.count = async () => 0
  const edited = await PATCH({ json: async () => ({ approvedLabelMap: { bug: 'feature' } }) }, { params: Promise.resolve({ mappingId: MAPPING_PUBLIC }) })
  assert.equal(edited.status, 200)
  assert.equal(updateData.firstSyncApprovedAt, null)

  failTransaction = true
  const concurrent = await PATCH({ json: async () => ({ projectId: OTHER_PROJECT_PUBLIC }) }, { params: Promise.resolve({ mappingId: MAPPING_PUBLIC }) })
  assert.equal(concurrent.status, 409)
  assert.equal(concurrent.body.error.code, 'CONFLICT')
})

test('unmapping deletes only the mapping and leaves imported identity references untouched', async () => {
  const references = [{ id: 'reference-1', workItemId: 'work-item-1' }]
  let deletedMappingId
  const mocks = makeOwnerMocks()
  mocks['@/lib/db'].prisma = {
    gitLabProjectMapping: {
      async findFirst() { return { id: mapping.id } },
      async delete({ where }) { deletedMappingId = where.id; return mapping },
    },
    externalWorkItemReference: { findMany: async () => references },
  }
  const { DELETE } = loadTs('../../app/api/integrations/gitlab/projects/[mappingId]/route.ts', mocks)
  const result = await DELETE({}, { params: Promise.resolve({ mappingId: MAPPING_PUBLIC }) })
  assert.equal(result.status, 200)
  assert.equal(deletedMappingId, mapping.id)
  assert.deepEqual(references, [{ id: 'reference-1', workItemId: 'work-item-1' }])
})

test('sync requires explicit first-sync approval and then calls only the configured server-side connector', async () => {
  const mocks = makeOwnerMocks()
  let approveAt
  let serviceCalls = 0
  let sentOwnerId
  mocks['@/lib/gitlab-issue-import'].syncGitLabProject = async ({ ownerId }) => {
    serviceCalls += 1
    sentOwnerId = ownerId
    return {
      counts: { created: 1, updated: 0, skipped: 0, failed: 0 },
      results: [{ outcome: 'created', sourceUrl: 'https://gitlab.example.test/base/group/project/-/issues/17', workItemId: '77777777-7777-4777-8777-777777777771' }],
    }
  }
  mocks['@/lib/db'].prisma = {
    gitLabProjectMapping: {
      async findFirst() { return mapping },
      async update({ where, data }) {
        assert.equal(where.updatedAt.getTime(), mapping.updatedAt.getTime())
        approveAt = data.firstSyncApprovedAt
        return { ...mapping, ...data }
      },
    },
  }
  const { POST } = loadTs('../../app/api/integrations/gitlab/sync/route.ts', mocks)
  const required = await POST({ json: async () => ({ mappingId: MAPPING_PUBLIC }) })
  assert.equal(required.status, 409)
  assert.equal(required.body.error.code, 'FIRST_SYNC_APPROVAL_REQUIRED')
  assert.equal(serviceCalls, 0)

  const authorized = await POST({ json: async () => ({ mappingId: MAPPING_PUBLIC, approveFirstSync: true }) })
  assert.equal(authorized.status, 200)
  assert.equal(approveAt.toISOString(), '2026-09-30T18:00:00.000Z')
  assert.equal(authorized.body.mappingId, MAPPING_PUBLIC)
  assert.equal(authorized.body.counts.created, 1)
  assert.equal(authorized.body.counts.failed, 0)
  assert.equal(authorized.body.results[0].outcome, 'created')
  assert.equal(authorized.body.results[0].sourceUrl, 'https://gitlab.example.test/base/group/project/-/issues/17')
  assert.equal(authorized.body.results[0].workItemId, '77777777-7777-4777-8777-777777777771')
  assert.equal(sentOwnerId, owner.internalId)
  assert.equal(serviceCalls, 1)
  assert.equal(JSON.stringify(authorized.body).includes(config.token), false)
})

test('first-sync approval stops if the mapping changed after it was read', async () => {
  const mocks = makeOwnerMocks()
  let serviceCalls = 0
  mocks['@/lib/db'].prisma = {
    gitLabProjectMapping: {
      async findFirst() { return mapping },
      async update({ where }) {
        assert.equal(where.updatedAt.getTime(), mapping.updatedAt.getTime())
        throw Object.assign(new Error('record changed'), { code: 'P2025' })
      },
    },
  }
  mocks['@/lib/gitlab-issue-import'].syncGitLabProject = async () => {
    serviceCalls += 1
    return { counts: { created: 0, updated: 0, skipped: 0, failed: 0 }, results: [] }
  }
  const { POST } = loadTs('../../app/api/integrations/gitlab/sync/route.ts', mocks)
  const result = await POST({ json: async () => ({ mappingId: MAPPING_PUBLIC, approveFirstSync: true }) })

  assert.equal(result.status, 409)
  assert.equal(result.body.error.code, 'CONFLICT')
  assert.equal(serviceCalls, 0)
})

test('unauthenticated sync is rejected before reading the request, configuration, or mapping', async () => {
  const mocks = makeOwnerMocks({ authorized: false })
  mocks['@/lib/db'].prisma = {
    gitLabProjectMapping: {
      async findUnique() { assert.fail('must not read mapping before owner authorization') },
    },
  }
  const { POST } = loadTs('../../app/api/integrations/gitlab/sync/route.ts', mocks)
  const result = await POST({ json: async () => assert.fail('must not parse sync body before owner authorization') })

  assert.equal(result.status, 401)
  assert.equal(result.body.error.code, 'OWNER_UNAUTHENTICATED')
  assert.equal(mocks['@/lib/owner'].calls(), 1)
  assert.equal(mocks['@/lib/gitlab-issue-import'].configurationCalls(), 0)
})
