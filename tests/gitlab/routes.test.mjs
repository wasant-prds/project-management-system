import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import test from 'node:test'
import vm from 'node:vm'

const require = createRequire(import.meta.url)
const ts = require('typescript')
const config = { baseUrl: 'https://gitlab.example.test/base', token: 'synthetic-private-token' }
const owner = { id: 'owner-1', name: 'Owner' }

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
      if (!(name in mocks)) throw new Error(`Unexpected import: ${name}`)
      return mocks[name]
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

function makeOwnerMocks({ authorized = true } = {}) {
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
      getGitLabConfiguration() { configurationCalls += 1; return config },
      configurationCalls: () => configurationCalls,
      validateApprovedLabelMap: (value) => value && typeof value === 'object' && !Array.isArray(value)
        && Object.values(value).every((entry) => ['bug', 'feature'].includes(entry)) ? value : null,
      GitLabProviderError: class GitLabProviderError extends Error { constructor(code, message) { super(message); this.code = code } },
      syncGitLabProject: async (args) => ({ counts: { created: 1, updated: 0, skipped: 0, failed: 0 }, results: [{ outcome: 'created', sourceUrl: 'https://gitlab.example.test/base/group/project/-/issues/17' }], ownerId: args.ownerId }),
    },
    '@/lib/db': { prisma: {} },
  }
}

const project = { id: 'pms-project-1', name: 'Project One', company: { id: 'company-1', name: 'Company One', displayName: null } }
const mapping = {
  id: 'mapping-1', canonicalGitLabInstanceUrl: config.baseUrl, gitLabProjectId: '42', projectId: project.id,
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

test('mapping create uses only server-configured instance and rejects client URL or secret fields', async () => {
  let createData
  const mocks = makeOwnerMocks()
  mocks['@/lib/db'].prisma = {
    project: { async findUnique() { return { id: project.id } } },
    externalWorkItemReference: { async findFirst() { return null } },
    gitLabProjectMapping: {
      async create({ data }) { createData = data; return { ...mapping, ...data } },
    },
  }
  const { POST } = loadTs('../../app/api/integrations/gitlab/projects/route.ts', mocks)
  const invalid = await POST({ json: async () => ({ gitLabProjectId: '42', projectId: project.id, approvedLabelMap: {}, instanceUrl: 'https://attacker.invalid', token: 'leak' }) })
  assert.equal(invalid.status, 400)
  const created = await POST({ json: async () => ({ gitLabProjectId: '42', projectId: project.id, approvedLabelMap: { bug: 'bug' } }) })
  assert.equal(created.status, 201)
  assert.equal(createData.canonicalGitLabInstanceUrl, config.baseUrl)
  assert.equal(createData.gitLabProjectId, '42')
  assert.equal(JSON.stringify(created.body).includes(config.token), false)
})

test('mapping creation rejects rebinding an imported source Project to a different PMS Project', async () => {
  const mocks = makeOwnerMocks()
  mocks['@/lib/db'].prisma = {
    project: { async findUnique() { return { id: 'pms-project-2' } } },
    externalWorkItemReference: { async findFirst({ where }) { return { id: 'reference-1', ...where } } },
    gitLabProjectMapping: { async create() { assert.fail('must not create a conflicting mapping') } },
  }
  const { POST } = loadTs('../../app/api/integrations/gitlab/projects/route.ts', mocks)
  const result = await POST({ json: async () => ({ gitLabProjectId: '42', projectId: 'pms-project-2', approvedLabelMap: {} }) })
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
    project: { async findUnique() { return { id: 'pms-project-2' } } },
    gitLabProjectMapping: {
      async findUnique() { return { ...mapping, approvedLabelMap: { bug: 'bug' } } },
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
  const moved = await PATCH({ json: async () => ({ projectId: 'pms-project-2' }) }, { params: Promise.resolve({ mappingId: mapping.id }) })
  assert.equal(moved.status, 409)
  assert.equal(referenceCountWhere.provider, 'gitlab')
  assert.equal(referenceCountWhere.canonicalGitLabInstanceUrl, config.baseUrl)
  assert.equal(referenceCountWhere.gitLabProjectId, '42')
  assert.equal(transactionOptions.isolationLevel, 'Serializable')
  assert.equal(updateData, undefined)

  mocks['@/lib/db'].prisma.externalWorkItemReference.count = async () => 0
  const edited = await PATCH({ json: async () => ({ approvedLabelMap: { bug: 'feature' } }) }, { params: Promise.resolve({ mappingId: mapping.id }) })
  assert.equal(edited.status, 200)
  assert.equal(updateData.firstSyncApprovedAt, null)

  failTransaction = true
  const concurrent = await PATCH({ json: async () => ({ projectId: 'pms-project-2' }) }, { params: Promise.resolve({ mappingId: mapping.id }) })
  assert.equal(concurrent.status, 409)
  assert.equal(concurrent.body.error.code, 'CONFLICT')
})

test('unmapping deletes only the mapping and leaves imported identity references untouched', async () => {
  const references = [{ id: 'reference-1', workItemId: 'work-item-1' }]
  let deletedMappingId
  const mocks = makeOwnerMocks()
  mocks['@/lib/db'].prisma = {
    gitLabProjectMapping: {
      async findUnique() { return { id: mapping.id } },
      async delete({ where }) { deletedMappingId = where.id; return mapping },
    },
    externalWorkItemReference: { findMany: async () => references },
  }
  const { DELETE } = loadTs('../../app/api/integrations/gitlab/projects/[mappingId]/route.ts', mocks)
  const result = await DELETE({}, { params: Promise.resolve({ mappingId: mapping.id }) })
  assert.equal(result.status, 200)
  assert.equal(deletedMappingId, mapping.id)
  assert.deepEqual(references, [{ id: 'reference-1', workItemId: 'work-item-1' }])
})

test('sync requires explicit first-sync approval and then calls only the configured server-side connector', async () => {
  const mocks = makeOwnerMocks()
  let approveAt
  let serviceCalls = 0
  mocks['@/lib/gitlab-issue-import'].syncGitLabProject = async ({ ownerId: sentOwnerId }) => {
    serviceCalls += 1
    return { counts: { created: 1, updated: 0, skipped: 0, failed: 0 }, results: [], ownerId: sentOwnerId }
  }
  mocks['@/lib/db'].prisma = {
    gitLabProjectMapping: {
      async findUnique() { return mapping },
      async update({ data }) { approveAt = data.firstSyncApprovedAt; return { ...mapping, ...data } },
    },
  }
  const { POST } = loadTs('../../app/api/integrations/gitlab/sync/route.ts', mocks)
  const required = await POST({ json: async () => ({ mappingId: mapping.id }) })
  assert.equal(required.status, 409)
  assert.equal(required.body.error.code, 'FIRST_SYNC_APPROVAL_REQUIRED')
  assert.equal(serviceCalls, 0)

  const authorized = await POST({ json: async () => ({ mappingId: mapping.id, approveFirstSync: true }) })
  assert.equal(authorized.status, 200)
  assert.equal(approveAt.toISOString(), '2026-09-30T18:00:00.000Z')
  assert.equal(authorized.body.ownerId, owner.id)
  assert.equal(JSON.stringify(authorized.body).includes(config.token), false)
})
