import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { createHash } from 'node:crypto'
import vm from 'node:vm'

const require = createRequire(import.meta.url)
const ts = require('typescript')
const owner = { id: 'owner-1', name: 'Owner', email: 'owner@example.test', avatar: null }
const response = { json: (body, options = {}) => ({ status: options.status ?? 200, body }) }

function loadTs(path, mocks = {}) {
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
    Buffer,
    console: { error() {} },
  }, { filename: path })
  return loaded.exports
}

function makeSystem() {
  const state = {
    projects: new Map([
      ['project-1', { id: 'project-1', name: 'Project One', colorProject: '#123456', company: { id: 'company-1', name: 'Company One', displayName: 'One' }, companyId: 'company-1' }],
      ['project-2', { id: 'project-2', name: 'Project Two', colorProject: null, company: { id: 'company-2', name: 'Company Two', displayName: null }, companyId: 'company-2' }],
    ]),
    workItems: new Map(),
    timeEntries: [],
    writes: 0,
    updates: 0,
    lastWhere: null,
    lastFindMany: null,
    lastTransactionOptions: null,
    authError: null,
    failTitle: null,
    failFindMany: false,
    projectLookupFailures: 0,
    workItemLookupFailures: 0,
    lockedWorkItems: [],
  }
  const now = new Date(Date.UTC(2026, 8, 30, 9, 30, 0))
  const asResponseItem = (item, includeEntries = false) => ({
    ...item,
    project: state.projects.get(item.projectId),
    assignee: { id: item.assigneeId, name: owner.name, email: owner.email, avatar: null },
    ...(includeEntries ? { timeEntries: state.timeEntries.filter((entry) => entry.workItemId === item.id && entry.userId === owner.id) } : {}),
  })
  const matchesFilter = (item, where) => {
    const project = state.projects.get(item.projectId)
    if (where.assigneeId && item.assigneeId !== where.assigneeId) return false
    if (where.projectId && item.projectId !== where.projectId) return false
    if (where.kind && item.kind !== where.kind) return false
    if (where.status && typeof where.status === 'string' && item.status.replaceAll('-', '_') !== where.status) return false
    if (where.status?.notIn && where.status.notIn.includes(item.status.replaceAll('-', '_'))) return false
    if (where.priority && item.priority !== where.priority) return false
    if ('role' in where && item.role !== where.role) return false
    if (where.project?.is?.companyId && project?.companyId !== where.project.is.companyId) return false
    if (where.project?.is?.name?.contains && !project?.name.toLowerCase().includes(where.project.is.name.contains.toLowerCase())) return false
    if (where.types?.has && !item.types.includes(where.types.has)) return false

    for (const field of ['workDate', 'dueDate', 'createdAt']) {
      if (!(field in where)) continue
      const condition = where[field]
      const value = item[field]
      if (condition === null) {
        if (value !== null) return false
        continue
      }
      if (condition.gte && (!value || value < condition.gte)) return false
      if (condition.lt && (!value || value >= condition.lt)) return false
      if (condition === null && value !== null) return false
    }

    if (where.id && typeof where.id === 'string' && item.id !== where.id) return false
    if (where.id?.lt && item.id >= where.id.lt) return false
    if (where.title?.contains && !item.title.toLowerCase().includes(where.title.contains.toLowerCase())) return false
    if (where.description?.contains && !String(item.description ?? '').toLowerCase().includes(where.description.contains.toLowerCase())) return false
    if (where.assignee?.is?.name?.contains && !owner.name.toLowerCase().includes(where.assignee.is.name.contains.toLowerCase())) return false
    if (where.AND && !where.AND.every((clause) => matchesFilter(item, clause))) return false
    if (where.OR && !where.OR.some((clause) => matchesFilter(item, clause))) return false
    return true
  }
  const prisma = {
    sql(strings, ...values) { return { strings, values } },
    async $queryRaw(query) { state.lockedWorkItems.push(query); return [] },
    async $transaction(callback, options) {
      state.lastTransactionOptions = options
      return callback(prisma)
    },
    project: {
      async findUnique({ where }) {
        if (state.projectLookupFailures > 0) {
          state.projectLookupFailures -= 1
          throw new Error('fixture project lookup failure')
        }
        return state.projects.get(where.id) ?? null
      },
      async findMany() { return [...state.projects.values()] },
    },
    timeEntry: {
      async count({ where }) { return state.timeEntries.filter((entry) => entry.workItemId === where.workItemId).length },
    },
    workItem: {
      async count({ where }) { return [...state.workItems.values()].filter((item) => matchesFilter(item, where)).length },
      async findMany(args) {
        if (state.failFindMany) throw new Error('fixture list failure')
        const { where } = args
        state.lastFindMany = args
        state.lastWhere = where
        return [...state.workItems.values()]
          .filter((item) => state.projects.has(item.projectId) && matchesFilter(item, where))
          .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime() || right.id.localeCompare(left.id))
          .slice(0, args.take)
          .map((item) => asResponseItem(item))
      },
      async findFirst({ where, include }) {
        const item = state.workItems.get(where.id)
        if (!item || item.assigneeId !== where.assigneeId) return null
        return asResponseItem(item, Boolean(include?.timeEntries))
      },
      async findUnique({ where }) {
        if (state.workItemLookupFailures > 0) {
          state.workItemLookupFailures -= 1
          throw new Error('fixture work item lookup failure')
        }
        const item = state.workItems.get(where.id)
        return item ? { id: item.id } : null
      },
      async create({ data }) {
        if (data.id && state.workItems.has(data.id)) throw { code: 'P2002' }
        if (!state.projects.has(data.projectId)) throw { code: 'P2003' }
        if (data.title === state.failTitle) throw new Error('fixture database failure')
        const id = data.id ?? `work-${state.workItems.size + 1}`
        const item = {
          id,
          title: data.title,
          description: data.description,
          kind: data.kind,
          priority: data.priority,
          role: data.role,
          status: data.status,
          types: data.types,
          workDate: data.workDate,
          dueDate: data.dueDate,
          submittedAt: data.submittedAt,
          createdAt: now,
          updatedAt: now,
          projectId: data.projectId,
          assigneeId: data.assigneeId,
        }
        state.workItems.set(id, item)
        state.writes += 1
        return asResponseItem(item)
      },
      async update({ where, data }) {
        const item = state.workItems.get(where.id)
        if (!item) throw { code: 'P2025' }
        const next = { ...item, ...data, updatedAt: now }
        if (data.project?.connect) next.projectId = data.project.connect.id
        if (data.assignee?.connect) next.assigneeId = data.assignee.connect.id
        delete next.project
        delete next.assignee
        state.workItems.set(where.id, next)
        state.updates += 1
        return asResponseItem(next)
      },
      async deleteMany({ where }) {
        const item = state.workItems.get(where.id)
        if (!item || item.assigneeId !== where.assigneeId) return { count: 0 }
        if (state.timeEntries.some((entry) => entry.workItemId === where.id)) throw { code: 'P2003' }
        state.workItems.delete(where.id)
        return { count: 1 }
      },
    },
  }

  const workItems = loadTs('../../lib/work-items.ts')
  const bangkok = loadTs('../../lib/bangkok-datetime.ts')
  const ownerBoundary = {
    async getOwner() {
      if (state.authError) throw state.authError
      return owner
    },
    ownerErrorResponse(error) {
      if (error === state.authError) return response.json({ error: { code: 'OWNER_UNAUTHENTICATED', message: 'Owner access required' } }, { status: 401 })
      return null
    },
  }
  const common = {
    'next/server': { NextResponse: response },
    '@/lib/db': { prisma },
    '@/lib/owner': ownerBoundary,
    '@/lib/work-items': workItems,
    '@/lib/bangkok-datetime': bangkok,
    '@/lib/work-item-input': loadTs('../../lib/work-item-input.ts', {
      '@/lib/work-items': workItems,
      '@/lib/bangkok-datetime': bangkok,
    }),
    '@/lib/work-item-response': loadTs('../../lib/work-item-response.ts', {
      '@/lib/work-items': workItems,
      '@/lib/bangkok-datetime': bangkok,
    }),
    '@/lib/work-item-lock': loadTs('../../lib/work-item-lock.ts', {
      '@prisma/client': { Prisma: { sql: prisma.sql } },
    }),
    'node:crypto': { createHash },
    '@prisma/client': { Prisma: { sql: prisma.sql, TransactionIsolationLevel: { Serializable: 'Serializable' } } },
  }
  return {
    state,
    prisma,
    parser: common['@/lib/work-item-input'],
    list: loadTs('../../app/api/work-items/route.ts', common),
    detail: loadTs('../../app/api/work-items/[id]/route.ts', common),
    importer: loadTs('../../app/api/work-items/import/route.ts', common),
    bangkok,
  }
}

const request = (body) => ({ json: async () => body })
const context = (id) => ({ params: Promise.resolve({ id }) })
const validInput = (overrides = {}) => ({
  title: 'Fix the workflow',
  projectId: 'project-1',
  kind: 'Issue',
  status: 'todo',
  priority: 'high',
  role: 'Developer',
  types: ['bug'],
  workDate: '2026-09-30',
  dueDate: '2026-10-02',
  ...overrides,
})

test('shared input parser accepts Bangkok calendar dates and rejects invalid calendar days', () => {
  const system = makeSystem()
  const parsed = system.parser.parseWorkItemInput(validInput(), owner.id)
  assert.equal('error' in parsed, false)
  assert.equal(parsed.data.workDate.toISOString(), '2026-09-30T00:00:00.000Z')
  assert.equal(parsed.data.dueDate.toISOString(), '2026-10-02T00:00:00.000Z')

  const patch = system.parser.parseWorkItemPatch({
    kind: 'Task',
    status: 'pm-testing',
    priority: 'urgent',
    role: '',
    types: ['feature'],
  }, owner.id)
  assert.equal(patch.data.kind, 'Task')
  assert.equal(patch.data.status, 'pm_testing')
  assert.equal(patch.data.priority, 'urgent')
  assert.equal(patch.data.role, null)
  assert.deepEqual([...patch.data.types], ['feature'])
  assert.match(system.parser.parseWorkItemInput(validInput({ workDate: '2026-02-30' }), owner.id).error, /YYYY-MM-DD/)
  assert.match(system.parser.parseWorkItemInput(validInput({ kind: 'Defect' }), owner.id).error, /kind/)
  assert.match(system.parser.parseWorkItemPatch({ kind: 'Defect' }, owner.id).error, /kind/)
  assert.match(system.parser.parseWorkItemPatch({ status: 'unknown' }, owner.id).error, /status/)
  assert.match(system.parser.parseWorkItemPatch({ priority: 'critical' }, owner.id).error, /priority/)
  assert.match(system.parser.parseWorkItemPatch({ role: 'manager' }, owner.id).error, /role/)
  assert.match(system.parser.parseWorkItemPatch({ types: ['unknown'] }, owner.id).error, /types/)
  assert.match(system.parser.parseWorkItemPatch({ dueDate: {} }, owner.id).error, /YYYY-MM-DD/)
})

test('create, update, and detail reads keep one owner WorkItem with Company and linked Daily Work', async () => {
  const system = makeSystem()
  const created = await system.list.POST(request(validInput({ status: 'sa-testing', role: 'infra' })))
  assert.equal(created.status, 201)
  const id = created.body.workItem.id
  assert.equal(created.body.workItem.status, 'sa-testing')
  assert.equal(created.body.workItem.workDate, '2026-09-30')
  assert.equal(created.body.workItem.submittedAt.endsWith('+07:00'), true)
  assert.equal(created.body.workItem.project.company.displayName, 'One')

  const updated = await system.detail.PATCH(request({ title: 'Updated workflow', status: 'completed', priority: 'urgent', role: 'SA', dueDate: '2026-10-05' }), context(id))
  assert.equal(updated.status, 200)
  assert.equal(updated.body.workItem.id, id)
  assert.equal(updated.body.workItem.status, 'completed')
  assert.equal(updated.body.workItem.title, 'Updated workflow')
  assert.equal(updated.body.workItem.dueDate, '2026-10-05')

  system.state.timeEntries.push({
    id: 'time-1', workItemId: id, userId: owner.id, date: new Date(Date.UTC(2026, 8, 29)),
    hours: { toString: () => '1.25' }, description: 'Review', remarks: null,
  })
  system.state.timeEntries.push({
    id: 'time-other', workItemId: id, userId: 'other-user', date: new Date(Date.UTC(2026, 8, 28)),
    hours: { toString: () => '8' }, description: 'Private log', remarks: null,
  })
  const detail = await system.detail.GET({}, context(id))
  assert.equal(detail.body.workItem.id, id)
  assert.equal(detail.body.workItem.status, 'completed')
  assert.equal(detail.body.workItem.timeEntries[0].date, '2026-09-29')
  assert.equal(detail.body.workItem.timeEntries[0].hours, '1.25')
  assert.equal(detail.body.workItem.timeEntries[0].description, 'Review')
  assert.equal(detail.body.workItem.timeEntries.length, 1)

  const collection = await system.list.GET({ url: 'http://local/api/work-items?year=all&month=all' })
  assert.equal(collection.body.workItems[0].id, id)
  assert.equal(collection.body.workItems[0].status, 'completed')
})

test('invalid create and update inputs or missing Projects do not write partial changes', async () => {
  const system = makeSystem()
  const created = await system.list.POST(request(validInput()))
  const id = created.body.workItem.id
  const original = system.state.workItems.get(id)
  const writes = system.state.writes
  const updates = system.state.updates

  const invalidEnum = await system.list.POST(request(validInput({ status: 'archived' })))
  assert.equal(invalidEnum.status, 400)
  const missingProject = await system.list.POST(request(validInput({ projectId: 'missing-project' })))
  assert.equal(missingProject.status, 404)
  const invalidPatch = await system.detail.PATCH(request({ dueDate: '2026-02-31' }), context(id))
  assert.equal(invalidPatch.status, 400)
  const badProjectPatch = await system.detail.PATCH(request({ projectId: 'missing-project' }), context(id))
  assert.equal(badProjectPatch.status, 404)
  const foreignOwner = await system.detail.PATCH(request({ assigneeId: 'other-user' }), context(id))
  assert.equal(foreignOwner.status, 400)

  assert.equal(system.state.writes, writes)
  assert.equal(system.state.updates, updates)
  assert.equal(system.state.workItems.get(id), original)

  const findProject = system.prisma.project.findUnique
  system.prisma.project.findUnique = async ({ where }) => {
    const project = await findProject({ where })
    if (where.id === 'project-2') system.state.projects.delete(where.id)
    return project
  }
  const projectRace = await system.list.POST(request(validInput({ projectId: 'project-2' })))
  assert.equal(projectRace.status, 404)
  assert.equal(projectRace.body.error.code, 'NOT_FOUND')
  assert.equal(system.state.writes, writes)

  system.state.authError = new Error('owner required')
  const unauthenticated = await system.list.POST(request(validInput()))
  assert.equal(unauthenticated.status, 401)
  assert.equal(system.state.writes, writes)
})

test('Work Item Project changes run serializably and reject moves with linked Daily Work', async () => {
  const system = makeSystem()
  const created = await system.list.POST(request(validInput()))
  const id = created.body.workItem.id
  const entry = { id: 'time-1', workItemId: id, projectId: 'project-1', userId: owner.id }
  system.state.timeEntries.push(entry)

  const rejected = await system.detail.PATCH(request({ projectId: 'project-2' }), context(id))
  assert.equal(rejected.status, 409)
  assert.equal(rejected.body.error.code, 'RELATION_MISMATCH')
  assert.equal(rejected.body.error.field, 'projectId')
  assert.equal(system.state.workItems.get(id).projectId, 'project-1')
  assert.equal(system.state.updates, 0)
  assert.equal(system.state.lastTransactionOptions.isolationLevel, 'Serializable')
  assert.equal(system.state.lockedWorkItems.length, 1)
  assert.match(system.state.lockedWorkItems[0].strings.join(''), /FOR UPDATE/)
  assert.deepEqual(Array.from(system.state.lockedWorkItems[0].values), [id, owner.id])

  const unchangedProject = await system.detail.PATCH(request({ projectId: 'project-1' }), context(id))
  assert.equal(unchangedProject.status, 200)
  assert.equal(system.state.workItems.get(id).projectId, 'project-1')
  assert.equal(system.state.lockedWorkItems.length, 2)
})

test('Work Item filters validate shared enums and apply owner, Project, Company, status, priority, and role filters', async () => {
  const system = makeSystem()
  const defaultPeriod = await system.list.GET({ url: 'http://local/api/work-items' })
  assert.equal(defaultPeriod.status, 200)
  const defaultDateRange = system.state.lastWhere.AND[0].OR[0].workDate.gte
  assert.equal(defaultDateRange.getUTCFullYear(), Number(system.bangkok.currentBangkokCalendarDate().slice(0, 4)))

  const result = await system.list.GET({
    url: 'http://local/api/work-items?year=all&month=all&projectId=project-1&companyId=company-1&kind=Issue&status=in-progress&priority=high&role=infra&search=bug',
  })
  assert.equal(result.status, 200)
  assert.equal(system.state.lastWhere.assigneeId, owner.id)
  assert.equal(system.state.lastWhere.projectId, 'project-1')
  assert.equal(system.state.lastWhere.project.is.companyId, 'company-1')
  assert.equal(system.state.lastWhere.kind, 'Issue')
  assert.equal(system.state.lastWhere.status, 'in_progress')
  assert.equal(system.state.lastWhere.priority, 'high')
  assert.equal(system.state.lastWhere.role, 'infra')
  assert.ok(system.state.lastWhere.AND[0].OR.some((clause) => clause.types?.has === 'bug'))

  for (const invalidFilter of ['kind=Defect', 'status=unknown', 'priority=critical', 'role=manager']) {
    const invalid = await system.list.GET({ url: `http://local/api/work-items?${invalidFilter}` })
    assert.equal(invalid.status, 400, invalidFilter)
    assert.equal(invalid.body.error.code, 'VALIDATION_ERROR', invalidFilter)
  }
})

test('Work Item collection uses bounded stable cursor pages bound to its filters', async () => {
  const system = makeSystem()
  for (const id of ['work-a', 'work-b', 'work-c', 'work-d']) {
    const created = await system.list.POST(request(validInput({ id, title: id })))
    assert.equal(created.status, 201)
  }

  const first = await system.list.GET({ url: 'http://local/api/work-items?year=all&month=all&limit=2' })
  assert.deepEqual(Array.from(first.body.workItems, (item) => item.id), ['work-4', 'work-3'])
  assert.equal(first.body.page.limit, 2)
  assert.equal(typeof first.body.page.nextCursor, 'string')
  assert.equal(first.body.summary.total, 4)
  assert.equal(first.body.summary.kinds.Issue, 4)
  assert.equal(system.state.lastFindMany.take, 3)
  assert.deepEqual(JSON.parse(JSON.stringify(system.state.lastFindMany.orderBy)), [{ createdAt: 'desc' }, { id: 'desc' }])

  const second = await system.list.GET({
    url: `http://local/api/work-items?year=all&month=all&limit=2&cursor=${encodeURIComponent(first.body.page.nextCursor)}`,
  })
  assert.deepEqual(Array.from(second.body.workItems, (item) => item.id), ['work-2', 'work-1'])
  assert.equal(second.body.page.nextCursor, null)

  const changedFilters = await system.list.GET({
    url: `http://local/api/work-items?year=all&month=all&limit=2&projectId=project-1&cursor=${encodeURIComponent(first.body.page.nextCursor)}`,
  })
  assert.equal(changedFilters.status, 400)
  assert.equal(changedFilters.body.error.field, 'cursor')
  assert.equal((await system.list.GET({ url: 'http://local/api/work-items?limit=0' })).status, 400)
  assert.equal((await system.list.GET({ url: 'http://local/api/work-items?limit=201' })).status, 400)
  assert.equal((await system.list.GET({ url: 'http://local/api/work-items?cursor=broken' })).status, 400)
})

test('Work Item collection and create unexpected errors use the shared error envelope', async () => {
  const system = makeSystem()
  system.state.failFindMany = true
  const getResult = await system.list.GET({ url: 'http://local/api/work-items?year=all&month=all' })
  assert.equal(getResult.status, 500)
  assert.deepEqual(JSON.parse(JSON.stringify(getResult.body.error)), { code: 'INTERNAL_ERROR', message: 'Failed to fetch work items' })

  system.state.failFindMany = false
  system.state.failTitle = 'Unexpected create failure'
  const postResult = await system.list.POST(request(validInput({ title: system.state.failTitle })))
  assert.equal(postResult.status, 500)
  assert.deepEqual(JSON.parse(JSON.stringify(postResult.body.error)), { code: 'INTERNAL_ERROR', message: 'Failed to create work item' })
})

test('delete refuses linked Daily Work, retains history, and deletes an unreferenced WorkItem', async () => {
  const system = makeSystem()
  const created = await system.list.POST(request(validInput()))
  const id = created.body.workItem.id
  const entry = { id: 'time-1', workItemId: id, userId: owner.id }
  system.state.timeEntries.push(entry)

  const blocked = await system.detail.DELETE({}, context(id))
  assert.equal(blocked.status, 409)
  assert.equal(blocked.body.error.code, 'HISTORY_CONFLICT')
  assert.equal(system.state.workItems.has(id), true)
  assert.equal(system.state.timeEntries[0], entry)

  system.state.timeEntries = []
  const removed = await system.detail.DELETE({}, context(id))
  assert.equal(removed.status, 200)
  assert.equal(system.state.workItems.has(id), false)
  assert.equal((await system.detail.DELETE({}, context(id))).status, 404)
})

test('bulk import reports each bad row and preserves valid and existing rows independently', async () => {
  const system = makeSystem()
  system.state.failTitle = 'DB failure'
  const existing = await system.list.POST(request(validInput({ title: 'Existing', id: 'existing-id' })))
  assert.equal(existing.status, 201)
  const duplicateId = existing.body.workItem.id
  const body = [
    validInput({ title: 'Good row', id: 'good-id' }),
    validInput({ title: 'Bad enum', kind: 'Bug' }),
    validInput({ title: 'Missing project', projectId: 'missing-project' }),
    validInput({ title: 'Duplicate', id: duplicateId }),
    validInput({ title: 'DB failure' }),
  ]

  const result = await system.importer.POST(request(body))
  assert.equal(result.status, 200)
  assert.equal(result.body.imported, 1)
  assert.deepEqual(Array.from(result.body.rows, (row) => row.outcome), ['created', 'failed', 'failed', 'skipped', 'failed'])
  assert.equal(result.body.rows[1].row, 2)
  assert.equal(result.body.rows[1].error.code, 'VALIDATION_ERROR')
  assert.match(result.body.rows[1].error.message, /kind/)
  assert.equal(result.body.rows[2].error.field, 'projectId')
  assert.equal(result.body.rows[3].error.code, 'DUPLICATE')
  assert.equal(system.state.workItems.get(duplicateId).title, 'Existing')
  assert.equal(system.state.workItems.get('good-id').title, 'Good row')

  const malformed = await system.importer.POST({ json: async () => { throw new SyntaxError('bad json') } })
  assert.equal(malformed.status, 400)
})

test('bulk import reports a Project foreign-key race per row and continues with later rows', async () => {
  const system = makeSystem()
  const findProject = system.prisma.project.findUnique
  system.prisma.project.findUnique = async ({ where }) => {
    const project = await findProject({ where })
    if (where.id === 'project-2') system.state.projects.delete(where.id)
    return project
  }

  const result = await system.importer.POST(request([
    validInput({ title: 'Project deleted during import', projectId: 'project-2' }),
    validInput({ title: 'Still imported' }),
  ]))
  assert.equal(result.status, 200)
  assert.equal(result.body.imported, 1)
  assert.deepEqual(Array.from(result.body.rows, (row) => row.outcome), ['failed', 'created'])
  assert.equal(result.body.rows[0].error.code, 'NOT_FOUND')
  assert.equal(system.state.workItems.get('work-1').title, 'Still imported')
})

test('bulk import reports Project and duplicate-ID lookup failures per row and continues safely', async () => {
  const system = makeSystem()
  system.state.projectLookupFailures = 1
  system.state.workItemLookupFailures = 1

  const result = await system.importer.POST(request([
    validInput({ title: 'Project lookup failure' }),
    validInput({ title: 'Created after Project failure' }),
    validInput({ title: 'ID lookup failure', id: 'lookup-id' }),
    validInput({ title: 'Created after ID failure' }),
  ]))

  assert.equal(result.status, 200)
  assert.equal(result.body.imported, 2)
  assert.deepEqual(Array.from(result.body.rows, (row) => row.outcome), ['failed', 'created', 'failed', 'created'])
  assert.equal(result.body.rows[0].error.code, 'IMPORT_FAILED')
  assert.equal(result.body.rows[2].error.code, 'IMPORT_FAILED')
  assert.equal(system.state.workItems.get('work-1').title, 'Created after Project failure')
  assert.equal(system.state.workItems.get('work-2').title, 'Created after ID failure')
})

test('Work Items JSON export is importable and urgency uses the Bangkok calendar date', () => {
  const workItems = loadTs('../../components/page/work-items/work-item-export.ts', {
    '@/lib/work-items': {
      WORK_ITEM_PRIORITY_LABELS: { high: 'High' },
      WORK_ITEM_ROLE_LABELS: { infra: 'Infrastructure' },
      WORK_ITEM_STATUS_LABELS: { 'in-progress': 'In Progress', completed: 'Completed', cancelled: 'Cancelled' },
    },
    './work-item-presentation': { formatDisplayDate: (value) => value?.slice(0, 10) ?? '—' },
    '@/lib/bangkok-datetime': {
      currentBangkokCalendarDate: (date) => date
        ? loadTs('../../lib/bangkok-datetime.ts').currentBangkokCalendarDate(date)
        : '2026-09-30',
    },
  })
  const item = {
    id: 'work-1', title: 'Task', description: null, kind: 'Task', priority: 'high', role: 'infra',
    status: 'in-progress', types: ['bug'], workDate: '2026-09-30', dueDate: '2026-10-01',
    project: { id: 'project-1', name: 'Project One', colorProject: null },
    assignee: { name: 'Owner' },
  }
  const rows = JSON.parse(workItems.generateWorkItemsJson([item]))
  assert.deepEqual(JSON.parse(JSON.stringify(rows[0])), {
    id: 'work-1', title: 'Task', description: null, kind: 'Task', priority: 'high', role: 'infra',
    status: 'in-progress', types: ['bug'], workDate: '2026-09-30', dueDate: '2026-10-01', projectId: 'project-1',
  })
  assert.equal(workItems.urgencySubgroup({ ...item, dueDate: '2026-09-30' }, new Date('2026-09-30T17:30:00.000Z')), 'overdue')
  assert.match(workItems.generateWorkItemsMarkdown([item], 'recent-activity'), /_Exported 2026-09-30\./)
})

test('Work Items detail and import UI expose Company, Daily Work, per-row reasons, and guarded deletion', () => {
  const page = readFileSync(new URL('../../app/work-items/page.tsx', import.meta.url), 'utf8')
  const dialog = readFileSync(new URL('../../components/page/work-items/work-item-view-dialog.tsx', import.meta.url), 'utf8')
  assert.match(page, /data\.rows/)
  assert.match(page, /แถว \$\{rowLabel\}: \$\{reason\}/)
  assert.match(page, /AlertDialogTitle>ยืนยันการลบ Work Item/)
  assert.match(page, /setStatusFilter/)
  assert.match(page, /setPriorityFilter/)
  assert.match(page, /setRoleFilter/)
  assert.match(page, /โหลดรายการเพิ่มเติม/)
  assert.match(page, /fetchAllFilteredItems/)
  assert.match(page, /yearOptionsLoadedRef\.current = false/)
  assert.match(page, /page: \{ limit: 200, cursor \}/)
  assert.match(dialog, /Company:/)
  assert.match(dialog, /Daily Work/)
  assert.match(dialog, /entry\.hours/)
})
