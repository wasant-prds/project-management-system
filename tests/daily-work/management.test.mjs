import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import test from 'node:test'
import vm from 'node:vm'

const require = createRequire(import.meta.url)
const ts = require('typescript')
const owner = { id: 'owner-1', name: 'Owner', email: 'owner@example.test', avatar: null }
const foreignOwner = { id: 'other-owner', name: 'Other', email: 'other@example.test', avatar: null }
const response = { json: (body, options = {}) => ({ status: options.status ?? 200, body, headers: options.headers ?? {} }) }

function loadTs(path, mocks = {}, globals = {}) {
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
    URLSearchParams,
    console: { error() {} },
    ...globals,
  }, { filename: path })
  return loaded.exports
}

function decimal(value) {
  return { toString: () => String(value), toJSON: () => String(value) }
}

function createSystem() {
  const state = {
    workItems: new Map([
      ['item-1', { id: 'item-1', projectId: 'project-1', assigneeId: owner.id, title: 'One', kind: 'Task', role: 'Developer', status: 'todo' }],
      ['item-2', { id: 'item-2', projectId: 'project-2', assigneeId: owner.id, title: 'Two', kind: 'Issue', role: 'infra', status: 'in_progress' }],
      ['foreign-item', { id: 'foreign-item', projectId: 'project-1', assigneeId: foreignOwner.id, title: 'Private', kind: 'Task', role: 'Developer', status: 'todo' }],
    ]),
    projects: new Map([
      ['project-1', { id: 'project-1', name: 'Project One', colorProject: '#123456', companyId: 'company-1' }],
      ['project-2', { id: 'project-2', name: 'Project Two', colorProject: '#654321', companyId: 'company-2' }],
    ]),
    companies: new Map([
      ['company-1', { id: 'company-1' }],
      ['company-2', { id: 'company-2' }],
    ]),
    entries: [],
    nextId: 1,
    ownerError: null,
    reads: 0,
    writes: 0,
    lastWhere: null,
    transactionOptions: [],
    locks: [],
    failReads: false,
    failWrites: false,
  }

  const withRelations = (entry) => ({
    ...entry,
    user: entry.userId === owner.id ? owner : foreignOwner,
    project: state.projects.get(entry.projectId) ?? null,
    workItem: state.workItems.get(entry.workItemId) ?? null,
  })
  const matchesWhere = (entry, where) => {
    if (entry.userId !== where.userId) return false
    if (where.id && entry.id !== where.id) return false
    if (where.date?.gte && entry.date < where.date.gte) return false
    if (where.date?.lt && entry.date >= where.date.lt) return false
    if (where.workItem?.is) {
      const item = state.workItems.get(entry.workItemId)
      const itemFilter = where.workItem.is
      if (!item) return false
      if (itemFilter.kind && item.kind !== itemFilter.kind) return false
      if ('role' in itemFilter && item.role !== itemFilter.role) return false
      if (itemFilter.project?.is) {
        const projectFilter = itemFilter.project.is
        if (projectFilter.id && item.projectId !== projectFilter.id) return false
        const project = state.projects.get(item.projectId)
        if (projectFilter.companyId && project?.companyId !== projectFilter.companyId) return false
      }
    }
    return true
  }

  const prisma = {
    async $transaction(callback, options) {
      state.transactionOptions.push(options)
      return callback(prisma)
    },
    async $queryRaw(query) {
      state.locks.push(query)
      return []
    },
    project: {
      async findUnique({ where }) { return state.projects.get(where.id) ?? null },
    },
    company: {
      async findUnique({ where }) { return state.companies.get(where.id) ?? null },
    },
    workItem: {
      async findFirst({ where }) {
        const item = state.workItems.get(where.id)
        if (!item || item.assigneeId !== where.assigneeId) return null
        if (where.projectId && item.projectId !== where.projectId) return null
        return { id: item.id, projectId: item.projectId }
      },
    },
    timeEntry: {
      async findMany({ where }) {
        state.reads += 1
        state.lastWhere = where
        if (state.failReads) throw new Error('database secret should not escape')
        return state.entries.filter((entry) => matchesWhere(entry, where)).map(withRelations)
      },
      async findFirst({ where }) {
        state.reads += 1
        if (state.failReads) throw new Error('database secret should not escape')
        const entry = state.entries.find((candidate) => matchesWhere(candidate, where))
        return entry ? withRelations(entry) : null
      },
      async create({ data }) {
        if (state.failWrites) throw new Error('database secret should not escape')
        state.writes += 1
        const now = new Date('2026-10-01T09:30:00.000Z')
        const entry = {
          id: `entry-${state.nextId++}`,
          description: null,
          remarks: null,
          status: null,
          ...data,
          hours: decimal(data.hours),
          createdAt: now,
          updatedAt: now,
        }
        state.entries.push(entry)
        return withRelations(entry)
      },
      async update({ where, data }) {
        state.writes += 1
        const entry = state.entries.find((candidate) => candidate.id === where.id)
        if (!entry) throw new Error('missing fixture entry')
        Object.assign(entry, data)
        if (data.hours !== undefined) entry.hours = decimal(data.hours)
        entry.updatedAt = new Date('2026-10-02T09:30:00.000Z')
        return withRelations(entry)
      },
      async deleteMany({ where }) {
        const index = state.entries.findIndex((candidate) => matchesWhere(candidate, where))
        if (index < 0) return { count: 0 }
        state.entries.splice(index, 1)
        state.writes += 1
        return { count: 1 }
      },
      async aggregate({ where }) {
        state.reads += 1
        state.lastWhere = where
        if (state.failReads) throw new Error('database secret should not escape')
        const hours = state.entries
          .filter((entry) => matchesWhere(entry, where))
          .map((entry) => entry.hours.toString())
        const helper = loadTs('../../lib/decimal-hours.ts', {})
        return { _sum: { hours: decimal(helper.sumDecimalHours(hours)) } }
      },
    },
  }

  const bangkok = loadTs('../../lib/bangkok-datetime.ts', {})
  const decimalHours = loadTs('../../lib/decimal-hours.ts', {})
  const workLogInput = loadTs('../../lib/work-log-input.ts', {
    '@/lib/decimal-hours': decimalHours,
    '@/lib/bangkok-datetime': bangkok,
  })
  const workLogs = loadTs('../../lib/work-logs.ts', {
    '@/lib/db': { prisma },
    '@/lib/work-items': { serializeWorkItemStatus: (status) => status.replaceAll('_', '-') },
    '@/lib/bangkok-datetime': bangkok,
  })
  const common = {
    'next/server': { NextResponse: response },
    '@/lib/db': { prisma },
    '@/lib/work-items': { WORK_ITEM_KINDS: ['Incident', 'Issue', 'Task'], WORK_ITEM_ROLES: ['Developer', 'infra', 'PM', 'SA', 'QA', 'UX/UI'] },
    '@/lib/owner': {
      async getOwner() {
        if (state.ownerError) throw state.ownerError
        return owner
      },
      ownerErrorResponse(error) {
        return error === state.ownerError ? response.json({ error: { code: 'OWNER_UNAUTHENTICATED' } }, { status: 401 }) : null
      },
    },
    '@/lib/bangkok-datetime': bangkok,
    '@/lib/work-log-input': workLogInput,
    '@/lib/work-item-lock': {
      async lockOwnedWorkItemForUpdate(_transaction, workItemId, ownerId) {
        state.locks.push({ workItemId, ownerId })
      },
    },
    '@/lib/work-logs': workLogs,
    '@prisma/client': { Prisma: { TransactionIsolationLevel: { Serializable: 'Serializable' } } },
  }

  return {
    state,
    decimalHours,
    bangkok,
    collection: loadTs('../../app/api/work-logs/route.ts', common),
    detail: loadTs('../../app/api/work-logs/[id]/route.ts', common),
    summary: loadTs('../../app/api/work-logs/summary/route.ts', common),
  }
}

function request(body) {
  return { json: async () => body }
}

function context(id) {
  return { params: Promise.resolve({ id }) }
}

function seedEntry(system, overrides = {}) {
  const entry = {
    id: `entry-${system.state.nextId++}`,
    description: 'Work',
    remarks: null,
    hours: decimal('1.25'),
    date: new Date('2026-10-01T00:00:00.000Z'),
    status: null,
    createdAt: new Date('2026-10-01T09:00:00.000Z'),
    updatedAt: new Date('2026-10-01T09:00:00.000Z'),
    userId: owner.id,
    projectId: 'project-1',
    workItemId: 'item-1',
    ...overrides,
  }
  system.state.entries.push(entry)
  return entry
}

test('positive decimal hour parser preserves exact decimal input and rejects non-numeric values', () => {
  assert.equal(createSystem().decimalHours.parsePositiveDecimalHours('9007199254740993.125'), '9007199254740993.125')
  assert.equal(createSystem().decimalHours.parsePositiveDecimalHours('1.2500'), '1.25')
  assert.equal(createSystem().decimalHours.parsePositiveDecimalHours(0.125), '0.125')
  for (const value of [0, -1, '0', '-0.25', '2 hours', '', 'Infinity', Number.NaN, Number.POSITIVE_INFINITY, {}, null]) {
    assert.equal(createSystem().decimalHours.parsePositiveDecimalHours(value), null, `value: ${String(value)}`)
  }
})

test('positive hours fit the persisted Decimal(65,30) integer and fractional bounds', () => {
  const { parsePositiveDecimalHours } = createSystem().decimalHours
  assert.equal(parsePositiveDecimalHours('1e-30'), '0.000000000000000000000000000001')
  assert.equal(parsePositiveDecimalHours('1e34'), '10000000000000000000000000000000000')
  assert.equal(parsePositiveDecimalHours('1e-31'), null)
  assert.equal(parsePositiveDecimalHours('1e35'), null)
})

test('POST rejects positive hours outside the TimeEntry Decimal range before writing', async () => {
  for (const hours of ['1e-31', '1e35']) {
    const system = createSystem()
    const result = await system.collection.POST(request({ workItemId: 'item-1', hours, date: '2026-10-01' }))
    assert.equal(result.status, 400)
    assert.equal(result.body.error.field, 'hours')
    seedEntry(system)
    const update = await system.detail.PATCH(request({ hours }), context('entry-1'))
    assert.equal(update.status, 400)
    assert.equal(update.body.error.field, 'hours')
    assert.equal(system.state.writes, 0)
  }
})

test('decimal hour summation is exact and does not round each entry', () => {
  const { sumDecimalHours } = createSystem().decimalHours
  assert.equal(sumDecimalHours(['0.1', '0.2', '1.005']), '1.305')
  assert.equal(sumDecimalHours(['9007199254740993.125', '0.875']), '9007199254740994')
  assert.equal(sumDecimalHours([]), '0')
})

test('POST creates an owner TimeEntry, derives its Project, and stores exact positive Decimal hours', async () => {
  const system = createSystem()
  const result = await system.collection.POST(request({
    workItemId: 'item-1', hours: '1.2500', date: '2026-10-01', description: 'Review', userId: owner.id,
  }))

  assert.equal(result.status, 201)
  assert.equal(result.body.workLog.hours, '1.25')
  assert.equal(result.body.workLog.date, '2026-10-01')
  assert.equal(result.body.workLog.userId, owner.id)
  assert.equal(result.body.workLog.projectId, 'project-1')
  assert.equal(result.body.workLog.workItemId, 'item-1')
  assert.match(result.body.workLog.createdAt, /\+07:00$/)
  assert.match(result.body.workLog.updatedAt, /\+07:00$/)
  assert.equal(system.state.transactionOptions[0].isolationLevel, 'Serializable')
  assert.deepEqual(system.state.locks[0], { workItemId: 'item-1', ownerId: owner.id })
})

test('POST accepts a Bangkok +07:00 timestamp but persists and returns only its calendar date', async () => {
  const system = createSystem()
  const result = await system.collection.POST(request({ workItemId: 'item-1', hours: 0.125, date: '2026-10-01T23:59:59.999+07:00' }))
  assert.equal(result.status, 201)
  assert.equal(system.state.entries[0].date.toISOString(), '2026-10-01T00:00:00.000Z')
  assert.equal(result.body.workLog.date, '2026-10-01')
  const invalid = await system.collection.POST(request({ workItemId: 'item-1', hours: 1, date: '2026-10-01T23:59:59Z' }))
  assert.equal(invalid.status, 400)
  assert.equal(system.state.writes, 1)
})

test('POST rejects zero hours without writing', async () => {
  const system = createSystem()
  const result = await system.collection.POST(request({ workItemId: 'item-1', hours: '0', date: '2026-10-01' }))
  assert.equal(result.status, 400)
  assert.equal(result.body.error.field, 'hours')
  assert.equal(system.state.writes, 0)
})

test('POST rejects negative hours without writing', async () => {
  const system = createSystem()
  const result = await system.collection.POST(request({ workItemId: 'item-1', hours: '-0.25', date: '2026-10-01' }))
  assert.equal(result.status, 400)
  assert.equal(result.body.error.field, 'hours')
  assert.equal(system.state.writes, 0)
})

test('POST rejects malformed and non-finite hours without writing', async () => {
  const system = createSystem()
  for (const hours of ['1.5 hours', 'Infinity', Number.NaN, Number.POSITIVE_INFINITY]) {
    const result = await system.collection.POST(request({ workItemId: 'item-1', hours, date: '2026-10-01' }))
    assert.equal(result.status, 400)
    assert.equal(result.body.error.field, 'hours')
  }
  assert.equal(system.state.writes, 0)
})

test('POST rejects missing WorkItem or business date before opening a transaction', async () => {
  const system = createSystem()
  const missingWorkItem = await system.collection.POST(request({ hours: 1, date: '2026-10-01' }))
  const missingDate = await system.collection.POST(request({ workItemId: 'item-1', hours: 1 }))
  assert.equal(missingWorkItem.status, 400)
  assert.equal(missingWorkItem.body.error.field, 'workItemId')
  assert.equal(missingDate.status, 400)
  assert.equal(missingDate.body.error.field, 'date')
  assert.equal(system.state.transactionOptions.length, 0)
  assert.equal(system.state.writes, 0)
})

test('POST rejects a client-supplied foreign owner', async () => {
  const system = createSystem()
  const result = await system.collection.POST(request({ userId: foreignOwner.id, workItemId: 'item-1', hours: 1, date: '2026-10-01' }))
  assert.equal(result.status, 400)
  assert.equal(result.body.error.field, 'userId')
  assert.equal(system.state.writes, 0)
})

test('POST rejects unauthenticated access before opening a transaction', async () => {
  const system = createSystem()
  system.state.ownerError = new Error('unauthenticated')
  const result = await system.collection.POST(request({ workItemId: 'item-1', hours: 1, date: '2026-10-01' }))
  assert.equal(result.status, 401)
  assert.equal(system.state.transactionOptions.length, 0)
  assert.equal(system.state.writes, 0)
})

test('POST rejects a Project that differs from the selected WorkItem', async () => {
  const system = createSystem()
  const result = await system.collection.POST(request({ projectId: 'project-2', workItemId: 'item-1', hours: 1, date: '2026-10-01' }))
  assert.equal(result.status, 400)
  assert.equal(result.body.error.code, 'RELATION_MISMATCH')
  assert.equal(system.state.writes, 0)
})

test('POST rejects WorkItems outside the authenticated owner scope', async () => {
  const system = createSystem()
  const result = await system.collection.POST(request({ workItemId: 'foreign-item', hours: 1, date: '2026-10-01' }))
  assert.equal(result.status, 404)
  assert.equal(system.state.writes, 0)
})

test('GET returns only owner records and queries Bangkok date boundaries as an exclusive next day', async () => {
  const system = createSystem()
  seedEntry(system)
  seedEntry(system, { id: 'foreign-entry', userId: foreignOwner.id })
  const result = await system.collection.GET(new Request('http://localhost/api/work-logs?date=2026-10-01'))
  assert.equal(result.status, 200)
  assert.equal(result.body.workLogs.length, 1)
  assert.equal(result.body.workLogs[0].date, '2026-10-01')
  assert.equal(system.state.lastWhere.userId, owner.id)
  assert.equal(system.state.lastWhere.date.gte.toISOString(), '2026-10-01T00:00:00.000Z')
  assert.equal(system.state.lastWhere.date.lt.toISOString(), '2026-10-02T00:00:00.000Z')
})

test('Dashboard Daily Work links preserve inclusive dates and filter through the WorkItem Project', async () => {
  const system = createSystem()
  seedEntry(system, { id: 'dashboard-match', date: new Date('2026-10-01T00:00:00.000Z'), workItemId: 'item-1' })
  seedEntry(system, { id: 'dashboard-other-project', date: new Date('2026-10-02T00:00:00.000Z'), workItemId: 'item-2', projectId: 'project-2' })

  const result = await system.collection.GET(new Request(
    'http://localhost/api/work-logs?startDate=2026-10-01&endDate=2026-10-01&companyId=company-1&projectId=project-1&role=Developer&kind=Task',
  ))

  assert.equal(result.status, 200)
  assert.deepEqual(Array.from(result.body.workLogs, (entry) => entry.id), ['dashboard-match'])
  assert.equal(system.state.lastWhere.userId, owner.id)
  assert.equal(system.state.lastWhere.date.gte.toISOString(), '2026-10-01T00:00:00.000Z')
  assert.equal(system.state.lastWhere.date.lt.toISOString(), '2026-10-02T00:00:00.000Z')
  assert.equal(system.state.lastWhere.workItem.is.project.is.id, 'project-1')
  assert.equal(system.state.lastWhere.workItem.is.project.is.companyId, 'company-1')
  assert.equal(system.state.lastWhere.workItem.is.role, 'Developer')
  assert.equal(system.state.lastWhere.workItem.is.kind, 'Task')
})

test('GET rejects invalid and incomplete Bangkok date filters before querying', async () => {
  const system = createSystem()
  const invalidDate = await system.collection.GET(new Request('http://localhost/api/work-logs?date=2026-02-30'))
  const incompleteRange = await system.collection.GET(new Request('http://localhost/api/work-logs?startDate=2026-10-01'))
  const conflictingFilters = await system.collection.GET(new Request('http://localhost/api/work-logs?date=2026-10-01&startDate=2026-10-01&endDate=2026-10-02'))
  assert.equal(invalidDate.status, 400)
  assert.equal(incompleteRange.status, 400)
  assert.equal(conflictingFilters.status, 400)
  assert.equal(system.state.reads, 0)
})

test('PATCH updates hours, details, and date while re-deriving Project from its WorkItem', async () => {
  const system = createSystem()
  seedEntry(system)
  const result = await system.detail.PATCH(request({
    workItemId: 'item-2', hours: '3.005', date: '2026-10-02', description: 'Updated', remarks: 'Checked',
  }), context('entry-1'))
  assert.equal(result.status, 200)
  assert.equal(result.body.workLog.hours, '3.005')
  assert.equal(result.body.workLog.date, '2026-10-02')
  assert.equal(result.body.workLog.description, 'Updated')
  assert.equal(result.body.workLog.projectId, 'project-2')
  assert.equal(result.body.workLog.workItemId, 'item-2')
  assert.equal(system.state.entries[0].userId, owner.id)
  assert.equal(system.state.transactionOptions[0].isolationLevel, 'Serializable')
})

test('PATCH rejects a Project mismatch even when Project is the only relation field sent', async () => {
  const system = createSystem()
  seedEntry(system)
  const result = await system.detail.PATCH(request({ projectId: 'project-2' }), context('entry-1'))
  assert.equal(result.status, 400)
  assert.equal(result.body.error.code, 'RELATION_MISMATCH')
  assert.equal(system.state.entries[0].projectId, 'project-1')
  assert.equal(system.state.writes, 0)
})

test('PATCH rejects legacy entries without a WorkItem and leaves their data unchanged', async () => {
  const system = createSystem()
  const orphan = seedEntry(system, { workItemId: null, projectId: null })
  const result = await system.detail.PATCH(request({ description: 'Cannot orphan a saved entry' }), context(orphan.id))
  assert.equal(result.status, 400)
  assert.equal(result.body.error.field, 'workItemId')
  assert.equal(orphan.description, 'Work')
  assert.equal(system.state.writes, 0)
})

test('PATCH rejects non-positive or malformed hours without updating', async (t) => {
  for (const [name, hours] of [['zero', '0'], ['negative', '-1'], ['malformed', '1h']]) {
    await t.test(name, async () => {
      const system = createSystem()
      seedEntry(system)
      const result = await system.detail.PATCH(request({ hours }), context('entry-1'))
      assert.equal(result.status, 400)
      assert.equal(result.body.error.field, 'hours')
      assert.equal(system.state.writes, 0)
    })
  }
})

test('PATCH rejects owner spoofing before reading or updating the entry', async () => {
  const system = createSystem()
  seedEntry(system)
  const result = await system.detail.PATCH(request({ userId: foreignOwner.id, description: 'Spoof' }), context('entry-1'))
  assert.equal(result.status, 400)
  assert.equal(result.body.error.field, 'userId')
  assert.equal(system.state.reads, 0)
  assert.equal(system.state.writes, 0)
})

test('PATCH returns not found for a missing or foreign TimeEntry', async () => {
  const system = createSystem()
  seedEntry(system, { id: 'foreign-entry', userId: foreignOwner.id })
  const missing = await system.detail.PATCH(request({ description: 'Update' }), context('missing'))
  const foreign = await system.detail.PATCH(request({ description: 'Update' }), context('foreign-entry'))
  assert.equal(missing.status, 404)
  assert.equal(foreign.status, 404)
  assert.equal(system.state.writes, 0)
})

test('DELETE removes only an owned TimeEntry and returns not found for a foreign one', async () => {
  const system = createSystem()
  seedEntry(system)
  seedEntry(system, { id: 'foreign-entry', userId: foreignOwner.id })
  const deleted = await system.detail.DELETE({}, context('entry-1'))
  const hidden = await system.detail.DELETE({}, context('foreign-entry'))
  assert.equal(deleted.status, 200)
  assert.equal(hidden.status, 404)
  assert.equal(system.state.entries.length, 1)
  assert.equal(system.state.entries[0].userId, foreignOwner.id)
})

test('GET detail does not disclose a foreign TimeEntry', async () => {
  const system = createSystem()
  seedEntry(system, { id: 'foreign-entry', userId: foreignOwner.id })
  const result = await system.detail.GET({}, context('foreign-entry'))
  assert.equal(result.status, 404)
  assert.equal(result.body.error.code, 'NOT_FOUND')
})

test('summary returns exact Decimal totals for the requested inclusive Bangkok date range', async () => {
  const system = createSystem()
  seedEntry(system, { hours: decimal('0.1'), date: new Date('2026-10-01T00:00:00.000Z') })
  seedEntry(system, { hours: decimal('0.2'), date: new Date('2026-10-02T00:00:00.000Z') })
  seedEntry(system, { hours: decimal('10'), date: new Date('2026-10-03T00:00:00.000Z') })
  const result = await system.summary.GET(new Request('http://localhost/api/work-logs/summary?startDate=2026-10-01&endDate=2026-10-02'))
  assert.equal(result.status, 200)
  assert.equal(result.body.summary.hours, '0.3')
  assert.equal(result.body.summary.timezone, 'Asia/Bangkok')
  assert.equal(system.state.lastWhere.userId, owner.id)
  assert.equal(system.state.lastWhere.date.lt.toISOString(), '2026-10-03T00:00:00.000Z')
})

test('hour summaries reflect the latest create, update, and delete values', async () => {
  const system = createSystem()
  const url = 'http://localhost/api/work-logs/summary'
  const created = await system.collection.POST(request({ workItemId: 'item-1', hours: '1.25', date: '2026-10-01' }))
  assert.equal(created.status, 201)
  assert.equal((await system.summary.GET(new Request(url))).body.summary.hours, '1.25')

  const updated = await system.detail.PATCH(request({ hours: '2.375' }), context(created.body.workLog.id))
  assert.equal(updated.status, 200)
  assert.equal((await system.summary.GET(new Request(url))).body.summary.hours, '2.375')

  const deleted = await system.detail.DELETE({}, context(created.body.workLog.id))
  assert.equal(deleted.status, 200)
  assert.equal((await system.summary.GET(new Request(url))).body.summary.hours, '0')
})

test('summary returns zero for an empty owner range without treating query errors as zero', async () => {
  const emptySystem = createSystem()
  const empty = await emptySystem.summary.GET(new Request('http://localhost/api/work-logs/summary'))
  assert.equal(empty.body.summary.hours, '0')

  const failedSystem = createSystem()
  failedSystem.state.failReads = true
  const failed = await failedSystem.summary.GET(new Request('http://localhost/api/work-logs/summary'))
  assert.equal(failed.status, 500)
  assert.equal(JSON.stringify(failed.body).includes('database secret'), false)
})

test('summary rejects incomplete and invalid ranges without aggregating', async () => {
  const system = createSystem()
  const incomplete = await system.summary.GET(new Request('http://localhost/api/work-logs/summary?startDate=2026-10-01'))
  const invalid = await system.summary.GET(new Request('http://localhost/api/work-logs/summary?startDate=2026-10-03&endDate=2026-10-01'))
  assert.equal(incomplete.status, 400)
  assert.equal(invalid.status, 400)
  assert.equal(system.state.reads, 0)
})

test('summary rejects unauthenticated access before querying TimeEntries', async () => {
  const system = createSystem()
  system.state.ownerError = new Error('unauthenticated')
  const result = await system.summary.GET(new Request('http://localhost/api/work-logs/summary'))
  assert.equal(result.status, 401)
  assert.equal(system.state.reads, 0)
})

test('create database failure returns a safe generic error', async () => {
  const system = createSystem()
  system.state.failWrites = true
  const result = await system.collection.POST(request({ workItemId: 'item-1', hours: 1, date: '2026-10-01' }))
  assert.equal(result.status, 500)
  assert.equal(JSON.stringify(result.body).includes('database secret'), false)
})

test('Bangkok rolling ranges use Bangkok today independent of the host timezone', () => {
  const previousTimezone = process.env.TZ
  process.env.TZ = 'America/Los_Angeles'
  try {
    const { bangkokRollingDateRange } = createSystem().bangkok
    assert.deepEqual(
      JSON.parse(JSON.stringify(bangkokRollingDateRange(7, new Date('2026-09-30T17:30:00.000Z')))),
      { startDate: '2026-09-25', endDate: '2026-10-01' },
    )
  } finally {
    if (previousTimezone === undefined) delete process.env.TZ
    else process.env.TZ = previousTimezone
  }
})

test('date-only values remain the selected calendar day in a non-Bangkok browser timezone', () => {
  const previousTimezone = process.env.TZ
  process.env.TZ = 'America/Los_Angeles'
  try {
    const utilities = loadTs('../../lib/utils.ts', {
      clsx: { clsx: () => '' },
      'tailwind-merge': { twMerge: () => '' },
    })
    const picked = utilities.dateOnlyToPickerDate('2026-10-01')
    assert.equal(utilities.formatDate(picked), '2026-10-01')
    assert.equal(utilities.dateOnlyToPickerDate('2026-02-30'), null)
  } finally {
    if (previousTimezone === undefined) delete process.env.TZ
    else process.env.TZ = previousTimezone
  }
})

test('Daily Work calendar ranges stay within selected weeks, months, and years', () => {
  const { bangkokCalendarPeriodRange } = createSystem().bangkok
  assert.deepEqual(JSON.parse(JSON.stringify(bangkokCalendarPeriodRange('2026-10-01', 'week'))), {
    startDate: '2026-09-27', endDate: '2026-10-03',
  })
  assert.deepEqual(JSON.parse(JSON.stringify(bangkokCalendarPeriodRange('2027-01-01', 'week'))), {
    startDate: '2026-12-27', endDate: '2027-01-02',
  })
  assert.deepEqual(JSON.parse(JSON.stringify(bangkokCalendarPeriodRange('2026-01-31', 'month'))), {
    startDate: '2026-01-01', endDate: '2026-01-31',
  })
  assert.deepEqual(JSON.parse(JSON.stringify(bangkokCalendarPeriodRange('2024-02-29', 'month'))), {
    startDate: '2024-02-01', endDate: '2024-02-29',
  })
  assert.deepEqual(JSON.parse(JSON.stringify(bangkokCalendarPeriodRange('2026-10-01', 'year'))), {
    startDate: '2026-01-01', endDate: '2026-12-31',
  })
  assert.equal(bangkokCalendarPeriodRange('2026-02-30', 'month'), null)
})

test('Daily Work calendar ranges do not change with the browser timezone', () => {
  const previousTimezone = process.env.TZ
  const utilities = loadTs('../../lib/utils.ts', {
    clsx: { clsx: () => '' },
    'tailwind-merge': { twMerge: () => '' },
  })
  const { bangkokCalendarPeriodRange } = createSystem().bangkok
  const ranges = []
  try {
    for (const timezone of ['America/Los_Angeles', 'Asia/Bangkok']) {
      process.env.TZ = timezone
      const selectedDate = utilities.dateOnlyToPickerDate('2026-10-01')
      ranges.push(bangkokCalendarPeriodRange(utilities.formatDate(selectedDate), 'week'))
    }
  } finally {
    if (previousTimezone === undefined) delete process.env.TZ
    else process.env.TZ = previousTimezone
  }
  assert.deepEqual(JSON.parse(JSON.stringify(ranges[0])), JSON.parse(JSON.stringify(ranges[1])))
})

test('Work Item option fetch follows every cursor and retains Project and year filters', async () => {
  const requests = []
  const firstPage = Array.from({ length: 200 }, (_, index) => `item-${index}`)
  const pages = [
    { workItems: firstPage, page: { nextCursor: 'next-page' } },
    { workItems: ['historical-item'], page: { nextCursor: null } },
  ]
  const { fetchCollection } = loadTs('../../lib/fetch-collection.ts', {}, {
    window: { location: { origin: 'http://localhost' } },
    fetch: async (url) => {
      requests.push(new URL(url))
      return { ok: true, json: async () => pages.shift() }
    },
  })

  const workItems = await fetchCollection('/api/work-items?projectId=project-1&year=all', 'workItems')
  assert.equal(workItems.length, 201)
  assert.equal(workItems.at(-1), 'historical-item')
  assert.equal(requests.length, 2)
  assert.equal(requests[0].searchParams.get('projectId'), 'project-1')
  assert.equal(requests[0].searchParams.get('year'), 'all')
  assert.equal(requests[0].searchParams.get('limit'), '200')
  assert.equal(requests[1].searchParams.get('cursor'), 'next-page')
})

test('Dashboard and Analysis request live hours and Work Item details display an exact total', () => {
  const dashboard = readFileSync(new URL('../../app/page.tsx', import.meta.url), 'utf8')
  const analysis = readFileSync(new URL('../../app/analysis/page.tsx', import.meta.url), 'utf8')
  const stat = readFileSync(new URL('../../components/layout/logged-hours-stat.tsx', import.meta.url), 'utf8')
  const workItemDialog = readFileSync(new URL('../../components/page/work-items/work-item-view-dialog.tsx', import.meta.url), 'utf8')
  const workLogDialog = readFileSync(new URL('../../components/page/daily-work/work-log-dialog.tsx', import.meta.url), 'utf8')
  const dailyWorkPage = readFileSync(new URL('../../app/daily-work/page.tsx', import.meta.url), 'utf8')
  assert.match(dashboard, /getDashboardSummary\(owner\.id, params\)/)
  assert.doesNotMatch(dashboard, /LoggedHoursStat/)
  assert.match(analysis, /fetch\(`\/api\/analysis\/summary\?\$\{requestQuery\}`/)
  assert.match(analysis, /report\.summary\.loggedHours/)
  assert.match(analysis, /<AnalysisChartsDeferred report={report}/)
  assert.match(readFileSync(new URL('../../components/page/analysis/analysis-charts-deferred.tsx', import.meta.url), 'utf8'), /<HoursPeriodTable report={report}/)
  assert.match(readFileSync(new URL('../../components/page/analysis/report-tables.tsx', import.meta.url), 'utf8'), /report\.loggedHoursByPeriod/)
  assert.match(stat, /\/api\/work-logs\/summary/)
  assert.match(workItemDialog, /sumDecimalHours\(entries\.map\(\(entry\) => entry\.hours\)\)/)
  assert.match(workLogDialog, /fetchCollection<WorkLogWorkItem>[\s\S]*?projectId=\$\{encodeURIComponent\(projectId\)\}&year=all/)
  assert.match(dailyWorkPage, /fetchCollection<Project>\("\/api\/projects", "projects"\)/)
  assert.match(dailyWorkPage, /bangkokCalendarPeriodRange\(formatDate\(date\), period\)/)
})

test('GitLab import implementation does not create TimeEntries automatically', () => {
  const importer = readFileSync(new URL('../../lib/gitlab-issue-import.ts', import.meta.url), 'utf8')
  assert.doesNotMatch(importer, /timeEntry\.(?:create|createMany|upsert)\s*\(/)
})

test('TimeEntry schema uses a Bangkok calendar date and explicit wall-clock timestamp types', () => {
  const schema = readFileSync(new URL('../../prisma/schema.prisma', import.meta.url), 'utf8')
  const timeEntry = schema.slice(schema.indexOf('model TimeEntry {'), schema.indexOf('// Activity Log'))
  assert.match(timeEntry, /date\s+DateTime\s+@default\(now\(\)\)\s+@db\.Date/)
  assert.match(timeEntry, /createdAt\s+DateTime\s+@default\(now\(\)\)\s+@db\.Timestamp\(3\)/)
  assert.match(timeEntry, /updatedAt\s+DateTime\s+@updatedAt\s+@db\.Timestamp\(3\)/)
  assert.match(timeEntry, /hours\s+Decimal\s+@db\.Decimal\(65,\s*30\)/)
})
