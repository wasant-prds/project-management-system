import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import vm from 'node:vm'
import { authorize, formatBangkokTimestamp } from '../../scripts/owner-gate.mjs'

const require = createRequire(import.meta.url)
const ts = require('typescript')
const sharedIdentity = {}
const OWNER_PUBLIC = '11111111-1111-4111-8111-111111111111'
const ITEM_PUBLIC = '77777777-7777-4777-8777-777777777777'
const PROJECT_PUBLIC = '33333333-3333-4333-8333-333333333333'
const OTHER_PROJECT_PUBLIC = '44444444-4444-4444-8444-444444444444'
const LOG_PUBLIC = '99999999-9999-4999-8999-999999999999'
const ownerIdentity = () => ({ id: OWNER_PUBLIC, internalId: 7n, name: 'Owner', email: 'owner@example.com', avatar: null, role: 'member', status: 'active' })

function loadTs(path, mocks, runtimeProcess = process) {
  const source = readFileSync(new URL(path, import.meta.url), 'utf8')
  const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  const mockedModule = { exports: {} }
  const fallbackMocks = {
    get '@/lib/work-log-input'() { return sharedWorkLogInput },
    '@/lib/bangkok-datetime': {
      currentBangkokCalendarDate: () => '2026-09-30',
      currentBangkokWallClockDate: () => new Date('2026-09-30T12:00:00.000Z'),
      parseBangkokCalendarDate: (value) => {
        if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
        const date = new Date(`${value}T00:00:00.000Z`)
        return date.toISOString().slice(0, 10) === value ? date : null
      },
    },
    '@/lib/work-item-response': {
      workItemInclude: {},
      workItemDetailInclude: () => ({}),
      serializeWorkItem: (workItem) => workItem,
    },
    '@/lib/work-item-input': {
      parseWorkItemPatch: (value, ownerId) => {
        if (value.assigneeId && value.assigneeId !== ownerId) {
          return { error: 'assigneeId must match the authenticated owner' }
        }
        return { data: { ...value, assigneeId: ownerId } }
      },
    },
    '@/lib/work-item-lock': { lockOwnedWorkItemForUpdate: async () => {} },
    '@/lib/error-message': {
      errorMessage: (error, fallback) => typeof error === 'object' && error !== null && 'message' in error && typeof error.message === 'string' ? error.message : fallback,
    },
    'node:crypto': require('node:crypto'),
    'node:path': require('node:path'),
    'node:fs': { readFileSync: () => '[]' },
    get '@/lib/public-id'() { return sharedIdentity.publicId },
    get '@/lib/legacy-identity'() { return sharedIdentity.legacy },
    get '@/lib/opaque-cursor'() { return sharedIdentity.cursor },
    '@prisma/client': {
      Prisma: {
        sql: (strings, ...values) => ({ strings, values }),
        TransactionIsolationLevel: { Serializable: 'Serializable' },
      },
    },
  }
  vm.runInNewContext(output, { module: mockedModule, exports: mockedModule.exports, require: (name) => {
    if (name in mocks) return mocks[name]
    if (name in fallbackMocks) return fallbackMocks[name]
    throw new Error(`Unexpected import: ${name}`)
  }, process: runtimeProcess, Headers, URL, Buffer, console }, { filename: path })
  return mockedModule.exports
}

sharedIdentity.publicId = loadTs('../../lib/public-id.ts', {})
sharedIdentity.legacy = loadTs('../../lib/legacy-identity.ts', {})
sharedIdentity.cursor = loadTs('../../lib/opaque-cursor.ts', {})
const sharedBangkokDate = loadTs('../../lib/bangkok-datetime.ts', {})
const sharedDecimalHours = loadTs('../../lib/decimal-hours.ts', {})
const sharedWorkLogInput = loadTs('../../lib/work-log-input.ts', {
  '@/lib/decimal-hours': sharedDecimalHours,
  '@/lib/bangkok-datetime': sharedBangkokDate,
})

test('owner resolver requires middleware identity and exactly one User', async () => {
  let authenticated = false
  let proof = null
  let users = []
  const { getOwner, ownerErrorResponse } = loadTs('../../lib/owner.ts', {
    'next/headers': { headers: async () => ({ get: (name) => {
      if (name === 'x-pms-owner-authenticated') return authenticated ? '1' : null
      return proof
    } }) },
    'next/server': { NextResponse: { json: (body, options) => ({ status: options.status, body }) } },
    'node:crypto': require('node:crypto'),
    '@/lib/db': { prisma: { user: { findMany: async () => users } } },
  }, { env: { PMS_INTERNAL_OWNER_PROOF: 'server-only-proof' } })
  const denied = await getOwner().catch((error) => ownerErrorResponse(error))
  assert.equal(denied.status, 401)
  assert.equal(denied.body.error.code, 'OWNER_UNAUTHENTICATED')
  authenticated = true
  await assert.rejects(getOwner(), /Owner access required/)
  proof = 'forged-proof'
  await assert.rejects(getOwner(), /Owner access required/)
  proof = 'server-only-proof'
  const unavailable = await getOwner().catch((error) => ownerErrorResponse(error))
  assert.equal(unavailable.status, 503)
  users = [
    { id: 7n, publicId: OWNER_PUBLIC, name: 'Owner', email: 'owner@example.com', avatar: null, role: 'member', status: 'active' },
    { id: 8n, publicId: '22222222-2222-4222-8222-222222222222', name: 'Other', email: 'other@example.com', avatar: null, role: 'member', status: 'active' },
  ]
  const ambiguous = await getOwner().catch((error) => ownerErrorResponse(error))
  assert.equal(ambiguous.status, 503)
  assert.equal(ambiguous.body.error.code, 'DEPENDENCY_UNAVAILABLE')
  users = [{ id: 7n, publicId: OWNER_PUBLIC, name: 'Owner', email: 'owner@example.com', avatar: null, role: 'member', status: 'active' }]
  const owner = await getOwner()
  assert.equal(owner.id, OWNER_PUBLIC)
  assert.equal(owner.internalId, 7n)
})

test('owner errors expose safe messages without leaking dependency diagnostics', () => {
  const { OwnerUnavailableError, ownerErrorMessage, ownerErrorResponse } = loadTs('../../lib/owner.ts', {
    'next/headers': { headers: async () => ({ get: () => null }) },
    'next/server': { NextResponse: { json: (body, options) => ({ status: options.status, body }) } },
    '@/lib/db': { prisma: {} },
  })
  for (const status of [401, 503]) {
    const error = new OwnerUnavailableError('private database diagnostics', status)
    const message = ownerErrorMessage(error)
    assert.equal(message, status === 401 ? 'กรุณายืนยันตัวตนเจ้าของระบบ' : 'ไม่พบเจ้าของระบบที่กำหนดไว้อย่างถูกต้อง')
    assert.equal(ownerErrorResponse(error).body.error.message, message)
    assert.doesNotMatch(message, /private database diagnostics/)
  }
  assert.equal(ownerErrorMessage(new Error('private database diagnostics')), null)
})

test('explicit owner ID selects one audited User while preserving legacy Users', async () => {
  let queriedWhere
  const { getOwner } = loadTs('../../lib/owner.ts', {
    'next/headers': { headers: async () => ({ get: (name) => name === 'x-pms-owner-authenticated' ? '1' : 'server-only-proof' }) },
    'next/server': { NextResponse: { json: () => ({}) } },
    'node:crypto': require('node:crypto'),
    '@/lib/db': { prisma: { user: {
      findUnique: async ({ where }) => {
        queriedWhere = where
        return { id: 7n, publicId: OWNER_PUBLIC, name: 'Owner', email: 'owner@example.com', avatar: null, role: 'member', status: 'active' }
      },
      findMany: async () => [],
    } } },
  }, { env: { PMS_INTERNAL_OWNER_PROOF: 'server-only-proof', OWNER_USER_ID: OWNER_PUBLIC } })
  const owner = await getOwner()
  assert.equal(owner.id, OWNER_PUBLIC)
  assert.equal(owner.internalId, 7n)
  assert.equal(queriedWhere.publicId, OWNER_PUBLIC)
})

test('owner access is not granted or denied by legacy User roles', async () => {
  let role = 'member'
  const queries = []
  const { getOwner } = loadTs('../../lib/owner.ts', {
    'next/headers': { headers: async () => ({ get: (name) => name === 'x-pms-owner-authenticated' ? '1' : 'server-only-proof' }) },
    'next/server': { NextResponse: { json: () => ({}) } },
    'node:crypto': require('node:crypto'),
    '@/lib/db': { prisma: { user: { findMany: async (query) => {
      queries.push(query)
      return [{ id: 7n, publicId: OWNER_PUBLIC, name: 'Owner', email: 'owner@example.com', avatar: null, role, status: 'active' }]
    } } } },
  }, { env: { PMS_INTERNAL_OWNER_PROOF: 'server-only-proof' } })

  for (role of ['member', 'admin', 'Developer', 'infra', 'SA']) {
    assert.equal((await getOwner()).id, OWNER_PUBLIC)
  }
  assert.ok(queries.every((query) => !query.where?.role))
})

test('WorkItem input takes assignee from server owner and rejects a different ID', () => {
  const validators = {
    isWorkItemKind: (value) => value === 'Task',
    isWorkItemPriority: (value) => value === 'none',
    isWorkItemRole: () => false,
    parseWorkItemStatus: (value) => value === 'todo' ? 'todo' : null,
    parseWorkItemTypes: () => [],
  }
  const { parseWorkItemInput } = loadTs('../../lib/work-item-input.ts', { '@/lib/work-items': validators })
  const input = { title: 'Task', projectId: 'project-1', kind: 'Task', status: 'todo' }
  assert.equal(parseWorkItemInput(input, 'owner-1').data.assigneeId, 'owner-1')
  assert.equal(parseWorkItemInput({ ...input, assigneeId: 'legacy-2' }, 'owner-1').error, 'assigneeId must match the authenticated owner')
  assert.equal(parseWorkItemInput({ ...input, assigneeId: 'owner-1' }, 'owner-1').data.assigneeId, 'owner-1')
})

test('middleware denies direct API/page reads and accepts only the gate proof', () => {
  class MockNextResponse {
    constructor(body, value) {
      this.status = value.status
      this.body = body
    }

    static next(value) {
      return { status: 200, forwarded: value?.request?.headers }
    }

    static json(body, value) {
      return { status: value.status, body }
    }
  }
  const { middleware } = loadTs('../../middleware.ts', { 'next/server': { NextResponse: MockNextResponse } }, { env: { PMS_INTERNAL_OWNER_PROOF: 'server-only-proof' } })
  const request = (path, proof, method = 'GET') => ({
    nextUrl: { pathname: path }, method, headers: new Headers(proof ? { 'x-pms-owner-proof': proof } : {}),
  })
  assert.equal(middleware(request('/api/projects')).status, 401)
  assert.equal(middleware(request('/api/work-items', null, 'POST')).status, 401)
  assert.equal(middleware(request('/work-items')).status, 401)
  assert.equal(middleware(request('/api/projects', 'forged')).status, 401)
  const accepted = middleware(request('/api/projects', 'server-only-proof'))
  assert.equal(accepted.status, 200)
  assert.equal(accepted.forwarded.get('x-pms-owner-proof'), 'server-only-proof')
  assert.equal(accepted.forwarded.get('x-pms-owner-authenticated'), '1')
  assert.equal(middleware(request('/work-items', 'server-only-proof')).status, 200)
  assert.equal(middleware(request('/api/health')).status, 200)
})

test('owner access audit timestamps use Bangkok wall-clock independently of machine timezone', () => {
  const previousTimezone = process.env.TZ
  process.env.TZ = 'America/Los_Angeles'
  try {
    assert.equal(formatBangkokTimestamp(new Date('2026-09-29T00:00:00.000Z')), '2026-09-29T07:00:00.000+07:00')
    assert.equal(formatBangkokTimestamp(new Date('2026-09-29T17:00:00.000Z')), '2026-09-30T00:00:00.000+07:00')
  } finally {
    if (previousTimezone === undefined) delete process.env.TZ
    else process.env.TZ = previousTimezone
  }
})

test('Daily Work dates parse, persist, query, and display with Bangkok wall-clock semantics', () => {
  const previousTimezone = process.env.TZ
  process.env.TZ = 'America/Los_Angeles'
  try {
    const { parseBangkokDateTime, currentBangkokWallClockDate, bangkokDateRange, serializeBangkokTimestamp, formatBangkokDateLabel } = loadTs('../../lib/bangkok-datetime.ts', {})
    const { formatDate } = loadTs('../../lib/utils.ts', { clsx: { clsx: () => '' }, 'tailwind-merge': { twMerge: () => '' } })
    assert.equal(parseBangkokDateTime('2026-09-30').toISOString(), '2026-09-30T00:00:00.000Z')
    assert.equal(parseBangkokDateTime('2026-09-30T01:02:03.004+07:00').toISOString(), '2026-09-30T01:02:03.004Z')
    assert.equal(parseBangkokDateTime('2026-09-30T01:02:03Z'), null)
    assert.equal(parseBangkokDateTime('2026-02-30'), null)
    assert.equal(currentBangkokWallClockDate(new Date('2026-09-29T17:00:00.000Z')).toISOString(), '2026-09-30T00:00:00.000Z')
    const range = bangkokDateRange('2026-09-30')
    assert.equal(range.start.toISOString(), '2026-09-30T00:00:00.000Z')
    assert.equal(range.end.toISOString(), '2026-10-01T00:00:00.000Z')
    assert.equal(serializeBangkokTimestamp(range.start), '2026-09-30T00:00:00.000+07:00')
    assert.equal(formatBangkokDateLabel('2026-09-30T00:00:00.000+07:00'), 'Sep 30, 2026')
    assert.equal(formatDate('2026-09-30T00:00:00.000+07:00'), '2026-09-30')
    assert.equal(formatDate('2026-09-30'), '2026-09-30')
  } finally {
    if (previousTimezone === undefined) delete process.env.TZ
    else process.env.TZ = previousTimezone
  }
})

test('Daily Work links only owner WorkItems and serializes calendar dates with Bangkok timestamps', async () => {
  const queries = []
  let selectedWorkItem = {
    id: 9n,
    publicId: ITEM_PUBLIC,
    projectId: 3n,
    project: { publicId: PROJECT_PUBLIC },
  }
  const { resolveOwnedWorkItem, serializeWorkLog } = loadTs('../../lib/work-logs.ts', {
    '@/lib/db': { prisma: { workItem: { findFirst: async (query) => {
      queries.push(query)
      return selectedWorkItem
    } } } },
    '@/lib/work-items': { serializeWorkItemStatus: (status) => status },
    '@/lib/bangkok-datetime': loadTs('../../lib/bangkok-datetime.ts', {}),
  })
  const resolved = await resolveOwnedWorkItem(ITEM_PUBLIC, 7n)
  assert.equal(resolved.publicId, ITEM_PUBLIC)
  assert.equal(resolved.project.publicId, PROJECT_PUBLIC)
  selectedWorkItem = null
  assert.equal(await resolveOwnedWorkItem(ITEM_PUBLIC, 7n), null)
  assert.equal(await resolveOwnedWorkItem({}, 7n), null)
  assert.equal(await resolveOwnedWorkItem('owned-item', 7n), null)
  assert.equal(queries[0].where.publicId, ITEM_PUBLIC)
  assert.equal(queries[0].where.assigneeId, 7n)
  const serialized = serializeWorkLog({
    publicId: '99999999-9999-4999-8999-999999999999',
    date: new Date('2026-09-30T00:00:00.000Z'),
    hours: { toString: () => '1.25' },
    createdAt: new Date('2026-09-30T01:00:00.000Z'),
    updatedAt: new Date('2026-09-30T02:00:00.000Z'),
    user: { publicId: OWNER_PUBLIC, name: 'Owner', email: 'owner@example.com', avatar: null },
    project: { publicId: PROJECT_PUBLIC, name: 'Project', colorProject: '#000000' },
    workItem: { publicId: ITEM_PUBLIC, title: 'Owned', kind: 'Task', status: 'todo', assigneeId: 7n },
  }, 7n)
  assert.equal(serialized.date, '2026-09-30')
  assert.equal(serialized.hours, '1.25')
  assert.equal(serialized.createdAt, '2026-09-30T01:00:00.000+07:00')
  assert.equal(serialized.updatedAt, '2026-09-30T02:00:00.000+07:00')
  assert.equal(serialized.workItem.id, ITEM_PUBLIC)
  assert.equal(serialized.workItem.assigneeId, undefined)
  assert.equal(serializeWorkLog({
    publicId: '99999999-9999-4999-8999-999999999999',
    date: new Date('2026-09-30T00:00:00.000Z'),
    hours: { toString: () => '1' },
    user: { publicId: OWNER_PUBLIC, name: 'Owner', email: 'owner@example.com', avatar: null },
    project: null,
    workItem: { publicId: ITEM_PUBLIC, title: 'Foreign', kind: 'Task', status: 'todo', assigneeId: 8n },
  }, 7n).workItem, null)
})

test('Daily Work date filters use exclusive Bangkok day boundaries regardless of machine timezone', async () => {
  const previousTimezone = process.env.TZ
  process.env.TZ = 'America/Los_Angeles'
  try {
    let query
    const { GET } = loadTs('../../app/api/work-logs/route.ts', {
      'next/server': { NextResponse: { json: (body, options) => ({ status: options.status, body }) } },
      '@/lib/db': { prisma: { timeEntry: { findMany: async (value) => { query = value; return [] } } } },
      '@/lib/work-items': { WORK_ITEM_KINDS: ['Incident', 'Issue', 'Task'], WORK_ITEM_ROLES: ['Developer', 'infra', 'SA'] },
      '@/lib/work-item-lock': { lockOwnedWorkItemForUpdate: async () => {} },
      '@prisma/client': { Prisma: { TransactionIsolationLevel: { Serializable: 'Serializable' } } },
      '@/lib/owner': { getOwner: async () => ownerIdentity(), ownerErrorResponse: () => null },
      '@/lib/work-logs': { serializeWorkLog: (value) => value, workLogInclude: {} },
      '@/lib/bangkok-datetime': loadTs('../../lib/bangkok-datetime.ts', {}),
    })
    const result = await GET(new Request('http://localhost/api/work-logs?date=2026-09-30'))
    assert.equal(result.status, 200)
    assert.equal(query.where.userId, 7n)
    assert.equal(query.where.date.gte.toISOString(), '2026-09-30T00:00:00.000Z')
    assert.equal(query.where.date.lt.toISOString(), '2026-10-01T00:00:00.000Z')
    const invalid = await GET(new Request('http://localhost/api/work-logs?date=2026-02-30'))
    assert.equal(invalid.status, 400)
  } finally {
    if (previousTimezone === undefined) delete process.env.TZ
    else process.env.TZ = previousTimezone
  }
})

test('Daily Work displays clear access errors and clears stale rows on failed reads', async () => {
  const { readWorkLogsResponse } = loadTs('../../lib/work-log-response.ts', {})
  for (const [status, code, title] of [
    [401, 'OWNER_UNAUTHENTICATED', 'Authentication required'],
    [403, 'ACCESS_DENIED', 'Access denied'],
    [503, 'DEPENDENCY_UNAVAILABLE', 'Error'],
  ]) {
    const result = await readWorkLogsResponse({
      ok: false,
      status,
      json: async () => ({ error: { code } }),
    })
    assert.equal(result.workLogs.length, 0)
    assert.equal(result.error.title, title)
    assert.ok(result.error.message)
  }
  const successful = await readWorkLogsResponse({
    ok: true,
    status: 200,
    json: async () => ({ workLogs: [{ id: 'log-1' }] }),
  })
  assert.deepEqual(Array.from(successful.workLogs), [{ id: 'log-1' }])
  assert.equal(successful.error, null)
})

test('Daily Work create rejects a different user and persists the server owner', async () => {
  const created = []
  const resolvedOwnerIds = []
  const lockedWorkItems = []
  const transactionOptions = []
  const response = { json: (body, options) => ({ status: options.status, body }) }
  const bangkokDate = loadTs('../../lib/bangkok-datetime.ts', {})
  const { POST } = loadTs('../../app/api/work-logs/route.ts', {
    'next/server': { NextResponse: response },
    '@/lib/db': { prisma: {
      async $transaction(callback, options) {
        transactionOptions.push(options)
        return callback({
          $queryRaw: async () => [],
          timeEntry: { create: async (query) => { created.push(query.data); return { ...query.data, workItem: null } } },
        })
      },
    } },
    '@/lib/owner': { getOwner: async () => ownerIdentity(), ownerErrorResponse: () => null },
    '@/lib/work-items': { WORK_ITEM_KINDS: ['Incident', 'Issue', 'Task'], WORK_ITEM_ROLES: ['Developer', 'infra', 'SA'] },
    '@/lib/work-logs': { resolveOwnedWorkItem: async (_workItemId, ownerId, database) => { resolvedOwnerIds.push(ownerId); assert.ok(database); return { id: 9n, projectId: 3n, project: { publicId: PROJECT_PUBLIC } } }, serializeWorkLog: (value) => value, workLogInclude: {} },
    '@/lib/work-item-lock': { lockOwnedWorkItemForUpdate: async (_transaction, workItemId, ownerId) => { lockedWorkItems.push({ workItemId, ownerId }) } },
    '@prisma/client': { Prisma: { TransactionIsolationLevel: { Serializable: 'Serializable' } } },
    '@/lib/bangkok-datetime': {
      parseBangkokDateTime: bangkokDate.parseBangkokDateTime,
      currentBangkokWallClockDate: bangkokDate.currentBangkokWallClockDate,
    },
  })
  const request = (body) => ({ json: async () => body })
  const valid = { hours: '2', projectId: PROJECT_PUBLIC, workItemId: ITEM_PUBLIC, date: '2026-09-28' }
  assert.equal((await POST(request({ ...valid, userId: 'legacy-2' }))).status, 400)
  assert.equal(created.length, 0)
  assert.equal((await POST(request(valid))).status, 201)
  assert.equal(created[0].userId, 7n)
  assert.deepEqual(resolvedOwnerIds, [7n])
  assert.deepEqual(lockedWorkItems, [{ workItemId: 9n, ownerId: 7n }])
  assert.equal(transactionOptions[0].isolationLevel, 'Serializable')
  assert.equal(created[0].date.toISOString(), '2026-09-28T00:00:00.000Z')
  assert.equal((await POST(request({ ...valid, date: '2026-09-28T10:30:00.000+07:00' }))).status, 201)
  assert.equal(created[1].date.toISOString(), '2026-09-28T00:00:00.000Z')
  assert.equal(resolvedOwnerIds[1], 7n)
  assert.equal(lockedWorkItems[1].workItemId, 9n)
})

test('Daily Work update rejects a foreign owner ID and invalid date or hours before writing', async () => {
  const updates = []
  const lookups = []
  const resolvedOwnerIds = []
  const lockedWorkItems = []
  const transactionOptions = []
  const timeEntry = {
    findFirst: async (query) => { lookups.push(query); return { id: 4n, projectId: 3n, workItemId: 9n } },
    update: async (query) => { updates.push(query.data); return { ...query.data, workItem: null } },
  }
  const database = {
    async $transaction(callback, options) {
      transactionOptions.push(options)
      return callback({ $queryRaw: async () => [], timeEntry, workItem: { findFirst: async () => ({ id: 9n, publicId: ITEM_PUBLIC, projectId: 3n, project: { publicId: PROJECT_PUBLIC } }) } })
    },
  }
  const response = { json: (body, options) => ({ status: options.status, body }) }
  const bangkokDate = loadTs('../../lib/bangkok-datetime.ts', {})
  const { PATCH } = loadTs('../../app/api/work-logs/[id]/route.ts', {
    'next/server': { NextResponse: response },
    '@/lib/db': { prisma: database },
    '@/lib/owner': { getOwner: async () => ownerIdentity(), ownerErrorResponse: () => null },
    '@/lib/work-logs': { resolveOwnedWorkItem: async (_workItemId, ownerId, databaseClient) => {
      resolvedOwnerIds.push(ownerId)
      assert.ok(databaseClient)
      return { id: 9n, projectId: 3n, project: { publicId: PROJECT_PUBLIC } }
    }, serializeWorkLog: (value) => value, workLogInclude: {} },
    '@/lib/work-item-lock': { lockOwnedWorkItemForUpdate: async (_transaction, workItemId, ownerId) => { lockedWorkItems.push({ workItemId, ownerId }) } },
    '@/lib/bangkok-datetime': {
      parseBangkokDateTime: bangkokDate.parseBangkokDateTime,
      currentBangkokWallClockDate: bangkokDate.currentBangkokWallClockDate,
    },
  })
  const request = (body) => ({ json: async () => body })
  const context = { params: Promise.resolve({ id: LOG_PUBLIC }) }

  const foreignOwner = await PATCH(request({ userId: 'legacy-2' }), context)
  assert.equal(foreignOwner.status, 400)
  assert.equal(foreignOwner.body.error.code, 'VALIDATION_ERROR')
  assert.equal(lookups.length, 0)

  for (const body of [
    { hours: { value: '2' } },
    { date: { value: '2026-09-28' } },
    { hours: '2 hours' },
    { date: 'not-a-date' },
  ]) {
    const result = await PATCH(request(body), context)
    assert.equal(result.status, 400)
    assert.equal(result.body.error.code, 'VALIDATION_ERROR')
  }
  assert.equal(updates.length, 0)

  const inconsistentProject = await PATCH(request({ projectId: OTHER_PROJECT_PUBLIC }), context)
  assert.equal(inconsistentProject.status, 400)
  assert.equal(inconsistentProject.body.error.code, 'RELATION_MISMATCH')
  assert.equal(inconsistentProject.body.error.field, 'projectId')
  assert.equal(updates.length, 0)

  const valid = await PATCH(request({ hours: '2.5', date: '2026-09-28', workItemId: ITEM_PUBLIC }), context)
  assert.equal(valid.status, 200)
  assert.equal(updates[0].hours, '2.5')
  assert.equal(updates[0].date.toISOString(), '2026-09-28T00:00:00.000Z')
  assert.equal(lookups.at(-1).where.userId, 7n)
  assert.equal(lookups.at(-1).where.publicId, LOG_PUBLIC)
  assert.equal(Object.hasOwn(updates[0], 'userId'), false)
  assert.deepEqual(resolvedOwnerIds, [7n])
  assert.equal(transactionOptions.at(-1).isolationLevel, 'Serializable')
  assert.deepEqual(lockedWorkItems, [
    { workItemId: 9n, ownerId: 7n },
    { workItemId: 9n, ownerId: 7n },
  ])
})

test('WorkItem create passes server owner into validation and persistence', async () => {
  const writes = []
  const response = { json: (body, options) => ({ status: options.status, body }) }
  const { POST } = loadTs('../../app/api/work-items/route.ts', {
    'next/server': { NextResponse: response },
    '@/lib/db': { prisma: {
      project: { findUnique: async () => ({ id: 3n }) },
      workItem: { create: async (query) => { writes.push(query.data); return { ...query.data, publicId: ITEM_PUBLIC } } },
    } },
    '@/lib/owner': { getOwner: async () => ownerIdentity(), ownerErrorResponse: () => null },
    '@/lib/work-items': { WORK_ITEM_KINDS: [], WORK_ITEM_STATUSES: [], serializeWorkItemStatus: (status) => status, shouldStampSubmittedAt: () => false },
    '@/lib/work-item-input': { parseWorkItemInput: (body, ownerId) => body.assigneeId === 'legacy-2'
      ? { error: 'assigneeId must match the authenticated owner' }
      : { data: { ...(body.id ? { id: body.id } : {}), projectId: PROJECT_PUBLIC, assigneeId: ownerId, status: 'todo' } } },
    '@prisma/client': { Prisma: { sql: () => {} } },
  })
  const request = (body) => ({ json: async () => body })
  assert.equal((await POST(request({ assigneeId: 'legacy-2' }))).status, 400)
  assert.equal(writes.length, 0)
  assert.equal((await POST(request({ id: 'client-item-id' }))).status, 400)
  assert.equal((await POST(request({ title: 'Task' }))).status, 201)
  assert.equal(writes[0].assigneeId, 7n)
  assert.equal(Object.hasOwn(writes[0], 'id'), false)
})

test('WorkItem update rejects a foreign assignee ID before reading or writing', async () => {
  const reads = []
  const writes = []
  const workItem = {
    findFirst: async (query) => { reads.push(query); return null },
    update: async (query) => { writes.push(query); return query.data },
  }
  const database = {
    $queryRaw: async () => [],
    workItem,
    async $transaction(callback) { return callback({ ...database }) },
  }
  const { PATCH } = loadTs('../../app/api/work-items/[id]/route.ts', {
    'next/server': { NextResponse: { json: (body, options) => ({ status: options.status, body }) } },
    '@/lib/db': { prisma: database },
    '@/lib/owner': { getOwner: async () => ownerIdentity(), ownerErrorResponse: () => null },
    '@/lib/work-items': {},
  })

  const result = await PATCH(
    { json: async () => ({ assigneeId: 'legacy-2' }) },
    { params: Promise.resolve({ id: ITEM_PUBLIC }) },
  )

  assert.equal(result.status, 400)
  assert.equal(result.body.error.code, 'VALIDATION_ERROR')
  assert.equal(reads.length, 0)
  assert.equal(writes.length, 0)

  const foreignRecord = await PATCH(
    { json: async () => ({ title: 'Attempted edit' }) },
    { params: Promise.resolve({ id: ITEM_PUBLIC }) },
  )
  assert.equal(foreignRecord.status, 404)
  assert.equal(reads[0].where.publicId, ITEM_PUBLIC)
  assert.equal(writes.length, 0)
})

test('WorkItem import accepts supported row shapes and processes rows independently', async () => {
  const imports = []
  const resolvedOwners = []
  const { POST } = loadTs('../../app/api/work-items/import/route.ts', {
    'next/server': { NextResponse: { json: (body, options) => ({ status: options.status, body }) } },
    '@/lib/db': { prisma: {
      project: { findUnique: async ({ where }) => where.publicId === PROJECT_PUBLIC ? { id: 3n } : null },
      workItem: { findUnique: async () => null,
        create: async ({ data }) => { imports.push(data); return { publicId: data.publicId ?? ITEM_PUBLIC } } },
    } },
    '@/lib/work-items': { shouldStampSubmittedAt: (status) => status === 'completed' },
    '@/lib/work-item-input': { parseWorkItemInput: (value, ownerId) => {
      resolvedOwners.push(ownerId)
      if (value.invalid) return { error: 'Invalid row' }
      if (value.assigneeId && value.assigneeId !== ownerId) return { error: 'assigneeId must match the authenticated owner' }
      return { data: { id: value.id, title: value.title, projectId: value.projectId, status: value.status, assigneeId: ownerId } }
    } },
    '@/lib/owner': { getOwner: async () => ownerIdentity(), ownerErrorResponse: () => null },
  })
  const request = (body) => ({ json: async () => body })

  assert.equal((await POST(request({ workItems: {} }))).status, 400)
  const invalidRow = await POST(request([{ title: 'First', projectId: PROJECT_PUBLIC }, { invalid: true }]))
  assert.equal(invalidRow.status, 200)
  assert.equal(invalidRow.body.imported, 1)
  assert.equal(invalidRow.body.rows[1].outcome, 'failed')
  const foreignAssignee = await POST(request([{ title: 'Spoofed', projectId: PROJECT_PUBLIC, assigneeId: 'legacy-2' }]))
  assert.equal(foreignAssignee.status, 200)
  assert.equal(foreignAssignee.body.rows[0].outcome, 'failed')
  assert.equal(resolvedOwners.at(-1), OWNER_PUBLIC)
  const missingProject = await POST(request([{ title: 'Missing', projectId: OTHER_PROJECT_PUBLIC }]))
  assert.equal(missingProject.status, 200)
  assert.equal(missingProject.body.rows[0].error.code, 'NOT_FOUND')

  const imported = await POST(request({ workItems: [
    { id: ITEM_PUBLIC, title: 'Completed', projectId: PROJECT_PUBLIC, status: 'completed' },
  ] }))
  assert.equal(imported.status, 200)
  assert.equal(imported.body.rows[0].outcome, 'created')
  assert.equal(imports.at(-1).assigneeId, 7n)
  assert.equal(imports.at(-1).publicId, ITEM_PUBLIC)
  assert.equal(Number.isNaN(imports.at(-1).submittedAt.getTime()), false)
  const todo = await POST(request([
    { title: 'Todo', projectId: PROJECT_PUBLIC, status: 'todo' },
  ]))
  assert.equal(todo.status, 200)
  assert.equal(imports.at(-1).submittedAt, null)
})

test('WorkItem API returns owner access error before reading input', async () => {
  const accessError = new Error('Owner access required')
  const { POST } = loadTs('../../app/api/work-items/route.ts', {
    'next/server': { NextResponse: { json: (body, options) => ({ status: options.status, body }) } },
    '@/lib/db': { prisma: {} },
    '@/lib/owner': {
      getOwner: async () => { throw accessError },
      ownerErrorResponse: (error) => error === accessError ? { status: 401 } : null,
    },
    '@/lib/work-items': { WORK_ITEM_KINDS: [], WORK_ITEM_STATUSES: [] },
    '@/lib/work-item-input': { parseWorkItemInput: () => { throw new Error('Input should not be read') } },
    '@prisma/client': { Prisma: { sql: () => {} } },
  })
  assert.equal((await POST({ json: async () => { throw new Error('Input should not be read') } })).status, 401)
})

test('WorkItem list keeps owner and period filters after refactor', async () => {
  let queriedWhere
  const { GET } = loadTs('../../app/api/work-items/route.ts', {
    'next/server': { NextResponse: { json: (body, options) => ({ status: options.status, body }) } },
    '@/lib/db': { prisma: {
      workItem: { findMany: async ({ where }) => { queriedWhere = where; return [] }, count: async () => 0 },
    } },
    '@/lib/owner': { getOwner: async () => ownerIdentity(), ownerErrorResponse: () => null },
    '@/lib/work-items': {
      WORK_ITEM_KINDS: ['Task'], WORK_ITEM_STATUSES: ['todo'], isWorkItemKind: (value) => value === 'Task',
      isWorkItemPriority: () => false, parseWorkItemStatus: (value) => value === 'todo' ? 'todo' : null,
      serializeWorkItemStatus: (value) => value,
    },
    '@/lib/work-item-input': { parseWorkItemInput: () => ({}) },
    '@prisma/client': { Prisma: { sql: () => {} } },
  })
  const invalid = await GET(new Request('http://localhost/api/work-items?assigneeId=other'))
  assert.equal(invalid.status, 400)
  assert.equal(invalid.body.error.code, 'VALIDATION_ERROR')
  const valid = await GET(new Request('http://localhost/api/work-items?year=2026&month=9&kind=Task'))
  assert.equal(valid.status, 200)
  assert.equal(queriedWhere.assigneeId, 7n)
  assert.equal(queriedWhere.kind, 'Task')
  assert.equal(queriedWhere.AND[0].OR.length, 3)
})

test('WorkItem year options only include years from the authenticated owner', async () => {
  let yearQuery
  const { GET } = loadTs('../../app/api/work-items/route.ts', {
    'next/server': { NextResponse: { json: (body, options) => ({ status: options?.status ?? 200, body }) } },
    '@/lib/db': { prisma: {
      $queryRaw: async (query) => { yearQuery = query; return [{ year: 2026 }] },
      workItem: { findMany: async () => [], count: async () => 0 },
    } },
    '@/lib/owner': { getOwner: async () => ownerIdentity(), ownerErrorResponse: () => null },
    '@/lib/work-items': {
      WORK_ITEM_KINDS: [], WORK_ITEM_STATUSES: [], isWorkItemKind: () => true,
      isWorkItemPriority: () => true, parseWorkItemStatus: (value) => value,
      serializeWorkItemStatus: (value) => value,
    },
    '@/lib/work-item-input': {},
    '@prisma/client': { Prisma: { sql: (strings, ...values) => ({ strings: Array.from(strings), values }) } },
  })
  const result = await GET(new Request('http://localhost/api/work-items?includeYears=true'))
  assert.equal(result.status, 200)
  assert.deepEqual(result.body.years, ['2026'])
  assert.ok(yearQuery.strings.join('?').includes('wi."assignee_id" = ?'))
  assert.deepEqual(yearQuery.values, [7n])
})

test('owner gate rejects forged internal proof headers without valid Basic credentials', () => {
  const env = { OWNER_GATE_USERNAME: 'owner', OWNER_GATE_PASSWORD: 'a'.repeat(32), APP_ORIGIN: 'http://localhost:3777', PMS_INTERNAL_OWNER_PROOF: 'server-only-proof' }
  const forgedHeaders = {
    'x-pms-owner-proof': env.PMS_INTERNAL_OWNER_PROOF,
    'x-pms-owner-authenticated': '1',
  }
  const request = (authorization) => ({ method: 'GET', headers: { ...forgedHeaders, authorization } })

  assert.equal(authorize(request(undefined), env), 401)
  assert.equal(authorize(request('Basic Zm9yZ2VkOmNyZWRlbnRpYWxz'), env), 401)
})

test('owner gate checks request Origin for writes and any supplied Origin', () => {
  const env = { OWNER_GATE_USERNAME: 'owner', OWNER_GATE_PASSWORD: 'a'.repeat(32), APP_ORIGIN: 'http://localhost:3777' }
  const authorization = `Basic ${Buffer.from(`owner:${env.OWNER_GATE_PASSWORD}`).toString('base64')}`
  const request = (method, origin) => ({ method, headers: { authorization, ...(origin ? { origin } : {}) } })

  assert.equal(authorize(request('GET'), env), 200)
  assert.equal(authorize(request('GET', 'https://attacker.example'), env), 403)
  assert.equal(authorize(request('POST'), env), 403)
  assert.equal(authorize(request('POST', 'https://attacker.example'), env), 403)
  assert.equal(authorize(request('POST', env.APP_ORIGIN), env), 200)
})
