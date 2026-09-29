import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import vm from 'node:vm'
import http from 'node:http'
import { createOwnerGate } from '../../scripts/owner-gate.mjs'

const require = createRequire(import.meta.url)
const ts = require('typescript')

function loadTs(path, mocks, runtimeProcess = process) {
  const source = readFileSync(new URL(path, import.meta.url), 'utf8')
  const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  const module = { exports: {} }
  vm.runInNewContext(output, { module, exports: module.exports, require: (name) => {
    if (!(name in mocks)) throw new Error(`Unexpected import: ${name}`)
    return mocks[name]
  }, process: runtimeProcess, Headers, URL, Buffer, console }, { filename: path })
  return module.exports
}

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
  users = [{ id: 'owner-1' }, { id: 'legacy-2' }]
  const ambiguous = await getOwner().catch((error) => ownerErrorResponse(error))
  assert.equal(ambiguous.status, 503)
  assert.equal(ambiguous.body.error.code, 'DEPENDENCY_UNAVAILABLE')
  users = [{ id: 'owner-1' }]
  assert.equal((await getOwner()).id, 'owner-1')
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
  const NextResponse = {
    next: (value) => ({ status: 200, forwarded: value?.request?.headers }),
    json: (body, value) => ({ status: value.status, body }),
  }
  const { middleware } = loadTs('../../middleware.ts', { 'next/server': { NextResponse } }, { env: { PMS_INTERNAL_OWNER_PROOF: 'server-only-proof' } })
  const request = (path, proof, method = 'GET') => ({
    nextUrl: { pathname: path }, method, headers: new Headers(proof ? { 'x-pms-owner-proof': proof } : {}),
  })
  assert.equal(middleware(request('/api/projects')).status, 401)
  assert.equal(middleware(request('/api/work-items', null, 'POST')).status, 401)
  assert.equal(middleware(request('/api/projects', 'forged')).status, 401)
  const accepted = middleware(request('/api/projects', 'server-only-proof'))
  assert.equal(accepted.status, 200)
  assert.equal(accepted.forwarded.get('x-pms-owner-proof'), 'server-only-proof')
  assert.equal(accepted.forwarded.get('x-pms-owner-authenticated'), '1')
  assert.equal(middleware(request('/api/health')).status, 200)
})

test('Daily Work create rejects a different user and persists the server owner', async () => {
  const created = []
  const response = { json: (body, options) => ({ status: options.status, body }) }
  const { POST } = loadTs('../../app/api/work-logs/route.ts', {
    'next/server': { NextResponse: response },
    '@/lib/db': { prisma: { timeEntry: { create: async (query) => { created.push(query.data); return { ...query.data, workItem: null } } } } },
    '@/lib/owner': { getOwner: async () => ({ id: 'owner-1' }), ownerErrorResponse: () => null },
    '@/lib/work-logs': { resolveWorkItemId: async () => 'item-1', serializeWorkLog: (value) => value, workLogInclude: {} },
  })
  const request = (body) => ({ json: async () => body })
  const valid = { hours: '2', projectId: 'project-1', workItemId: 'item-1', date: '2026-09-28' }
  assert.equal((await POST(request({ ...valid, userId: 'legacy-2' }))).status, 400)
  assert.equal(created.length, 0)
  assert.equal((await POST(request(valid))).status, 201)
  assert.equal(created[0].userId, 'owner-1')
})

test('Daily Work update rejects a foreign owner ID and invalid date or hours before writing', async () => {
  const updates = []
  const lookups = []
  const response = { json: (body, options) => ({ status: options.status, body }) }
  const { PATCH } = loadTs('../../app/api/work-logs/[id]/route.ts', {
    'next/server': { NextResponse: response },
    '@/lib/db': { prisma: { timeEntry: {
      findFirst: async (query) => { lookups.push(query); return { projectId: 'project-1' } },
      update: async (query) => { updates.push(query.data); return { ...query.data, workItem: null } },
    } } },
    '@/lib/owner': { getOwner: async () => ({ id: 'owner-1' }), ownerErrorResponse: () => null },
    '@/lib/work-logs': { resolveWorkItemId: async () => 'item-1', serializeWorkLog: (value) => value, workLogInclude: {} },
  })
  const request = (body) => ({ json: async () => body })
  const context = { params: Promise.resolve({ id: 'log-1' }) }

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

  const valid = await PATCH(request({ hours: '2.5', date: '2026-09-28' }), context)
  assert.equal(valid.status, 200)
  assert.equal(updates[0].hours, 2.5)
  assert.equal(updates[0].date.toISOString(), '2026-09-28T00:00:00.000Z')
  assert.equal(lookups.at(-1).where.userId, 'owner-1')
  assert.equal(Object.hasOwn(updates[0], 'userId'), false)
})

test('WorkItem create passes server owner into validation and persistence', async () => {
  const writes = []
  const response = { json: (body, options) => ({ status: options.status, body }) }
  const { POST } = loadTs('../../app/api/work-items/route.ts', {
    'next/server': { NextResponse: response },
    '@/lib/db': { prisma: {
      project: { findUnique: async () => ({ id: 'project-1' }) },
      workItem: { create: async (query) => { writes.push(query.data); return { ...query.data, id: 'item-1' } } },
    } },
    '@/lib/owner': { getOwner: async () => ({ id: 'owner-1' }), ownerErrorResponse: () => null },
    '@/lib/work-items': { WORK_ITEM_KINDS: [], WORK_ITEM_STATUSES: [], serializeWorkItemStatus: (status) => status, shouldStampSubmittedAt: () => false },
    '@/lib/work-item-input': { parseWorkItemInput: (body, ownerId) => body.assigneeId === 'legacy-2'
      ? { error: 'assigneeId must match the authenticated owner' }
      : { data: { ...(body.id ? { id: body.id } : {}), projectId: 'project-1', assigneeId: ownerId, status: 'todo' } } },
    '@prisma/client': { Prisma: { sql: () => {} } },
  })
  const request = (body) => ({ json: async () => body })
  assert.equal((await POST(request({ assigneeId: 'legacy-2' }))).status, 400)
  assert.equal(writes.length, 0)
  assert.equal((await POST(request({ id: 'client-item-id' }))).status, 201)
  assert.equal(writes[0].assigneeId, 'owner-1')
  assert.equal(Object.hasOwn(writes[0], 'id'), false)
})

test('WorkItem update rejects a foreign assignee ID before reading or writing', async () => {
  const reads = []
  const writes = []
  const { PATCH } = loadTs('../../app/api/work-items/[id]/route.ts', {
    'next/server': { NextResponse: { json: (body, options) => ({ status: options.status, body }) } },
    '@/lib/db': { prisma: { workItem: {
      findUnique: async (query) => { reads.push(query); return { assigneeId: 'legacy-2' } },
      update: async (query) => { writes.push(query); return query.data },
    } } },
    '@/lib/owner': { getOwner: async () => ({ id: 'owner-1' }), ownerErrorResponse: () => null },
    '@/lib/work-items': {},
  })

  const result = await PATCH(
    { json: async () => ({ assigneeId: 'legacy-2' }) },
    { params: Promise.resolve({ id: 'item-1' }) },
  )

  assert.equal(result.status, 400)
  assert.equal(result.body.error.code, 'VALIDATION_ERROR')
  assert.equal(reads.length, 0)
  assert.equal(writes.length, 0)

  const foreignRecord = await PATCH(
    { json: async () => ({ title: 'Attempted edit' }) },
    { params: Promise.resolve({ id: 'item-1' }) },
  )
  assert.equal(foreignRecord.status, 404)
  assert.equal(reads[0].where.id, 'item-1')
  assert.equal(writes.length, 0)
})

test('WorkItem import accepts supported row shapes and validates rows before bulk creation', async () => {
  const imports = []
  let availableProjects = ['project-1']
  const resolvedOwners = []
  const { POST } = loadTs('../../app/api/work-items/import/route.ts', {
    'next/server': { NextResponse: { json: (body, options) => ({ status: options.status, body }) } },
    '@/lib/db': { prisma: {
      project: { findMany: async ({ where }) => availableProjects
        .filter((id) => where.id.in.includes(id))
        .map((id) => ({ id })) },
      workItem: { createMany: async ({ data }) => { imports.push(data); return { count: data.length } } },
    } },
    '@/lib/work-items': { shouldStampSubmittedAt: (status) => status === 'completed' },
    '@/lib/work-item-input': { parseWorkItemInput: (value, ownerId) => {
      resolvedOwners.push(ownerId)
      if (value.invalid) return { error: 'Invalid row' }
      if (value.assigneeId && value.assigneeId !== ownerId) return { error: 'assigneeId must match the authenticated owner' }
      return { data: { id: value.id, title: value.title, projectId: value.projectId, status: value.status, assigneeId: ownerId } }
    } },
    '@/lib/owner': { getOwner: async () => ({ id: 'owner-1' }), ownerErrorResponse: () => null },
  })
  const request = (body) => ({ json: async () => body })

  assert.equal((await POST(request({ workItems: {} }))).status, 400)
  const invalidRow = await POST(request([{ title: 'First', projectId: 'project-1' }, { invalid: true }]))
  assert.equal(invalidRow.status, 400)
  assert.equal(invalidRow.body.row, 2)
  const foreignAssignee = await POST(request([{ title: 'Spoofed', projectId: 'project-1', assigneeId: 'legacy-2' }]))
  assert.equal(foreignAssignee.status, 400)
  assert.equal(foreignAssignee.body.row, 1)
  assert.equal(resolvedOwners.at(-1), 'owner-1')
  const missingProject = await POST(request([{ title: 'Missing', projectId: 'project-2' }]))
  assert.equal(missingProject.status, 404)
  assert.equal(missingProject.body.row, 1)
  assert.equal(imports.length, 0)

  const imported = await POST(request({ workItems: [
    { id: 'item-1', title: 'Completed', projectId: 'project-1', status: 'completed' },
  ] }))
  assert.equal(imported.status, 201)
  assert.equal(imports[0][0].assigneeId, 'owner-1')
  assert.equal(Number.isNaN(imports[0][0].submittedAt.getTime()), false)
  assert.equal((await POST(request([
    { title: 'Todo', projectId: 'project-1', status: 'todo' },
  ]))).status, 201)
  assert.equal(imports[1][0].submittedAt, null)
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
      workItem: { findMany: async ({ where }) => { queriedWhere = where; return [] } },
    } },
    '@/lib/owner': { getOwner: async () => ({ id: 'owner-1' }), ownerErrorResponse: () => null },
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
  assert.equal(queriedWhere.assigneeId, 'owner-1')
  assert.equal(queriedWhere.kind, 'Task')
  assert.equal(queriedWhere.AND[0].OR.length, 3)
})

test('gate replaces a forged internal proof only after owner credential check', async () => {
  const env = { OWNER_GATE_USERNAME: 'owner', OWNER_GATE_PASSWORD: 'a'.repeat(32), APP_ORIGIN: 'http://localhost:3777', PMS_INTERNAL_OWNER_PROOF: 'server-only-proof' }
  const upstream = http.createServer((request, response) => {
    response.setHeader('content-type', 'application/json')
    response.end(JSON.stringify({
      proof: request.headers['x-pms-owner-proof'],
      authorization: request.headers.authorization,
      authenticated: request.headers['x-pms-owner-authenticated'],
    }))
  }).listen(0, '127.0.0.1')
  await new Promise((resolve) => upstream.once('listening', resolve))
  const gate = createOwnerGate(env, upstream.address().port).listen(0, '127.0.0.1')
  await new Promise((resolve) => gate.once('listening', resolve))
  try {
    const url = `http://127.0.0.1:${gate.address().port}/api/users`
    const denied = await fetch(url, { headers: { 'x-pms-owner-proof': 'forged' } })
    assert.equal(denied.status, 401)
    const accepted = await fetch(url, { headers: {
      authorization: `Basic ${Buffer.from(`owner:${env.OWNER_GATE_PASSWORD}`).toString('base64')}`,
      'x-pms-owner-proof': 'forged',
      'x-pms-owner-authenticated': '1',
    } })
    assert.equal(accepted.status, 200)
    assert.deepEqual(await accepted.json(), { proof: 'server-only-proof' })
  } finally {
    gate.close()
    upstream.close()
  }
})
