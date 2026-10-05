import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import vm from 'node:vm'
import { resolveTestImport } from '../support/identity-modules.mjs'

const require = createRequire(import.meta.url)
const ts = require('typescript')

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
      const resolved = resolveTestImport(name, mocks)
      if (resolved === undefined) throw new Error(`Unexpected import: ${name}`)
      return resolved
    },
    URL,
    URLSearchParams,
    Buffer,
    console: globals.console ?? console,
  }, { filename: path })
  return loaded.exports
}

const bangkok = loadTs('../../lib/bangkok-datetime.ts')
const decimal = loadTs('../../lib/decimal-hours.ts')
const projectManagement = loadTs('../../lib/project-management.ts', {
  '@/lib/decimal-hours': decimal,
  'next/server': { NextResponse: { json: (body, init = {}) => ({ status: init.status ?? 200, body }) } },
})
const workItemsModule = loadTs('../../lib/work-items.ts')
const dashboard = loadTs('../../lib/dashboard.ts', {
  '@/lib/db': { prisma: {} },
  '@/lib/bangkok-datetime': bangkok,
  '@/lib/project-management': projectManagement,
  '@/lib/work-items': workItemsModule,
})
const analysis = loadTs('../../lib/analysis.ts', {
  '@/lib/db': { prisma: {} },
  '@/lib/bangkok-datetime': bangkok,
  '@/lib/decimal-hours': decimal,
  '@/lib/project-management': projectManagement,
  '@/lib/dashboard': dashboard,
  '@/lib/work-items': workItemsModule,
})
const sourceLinks = loadTs('../../lib/analysis-links.ts')
const analysisExport = loadTs('../../lib/analysis-export.ts')

const fixedNow = new Date('2026-10-02T04:00:00.000Z')
const OWNER_PUBLIC = '11111111-1111-4111-8111-111111111111'
const ownerId = 7n
const COMPANY_A = '55555555-5555-4555-8555-555555555555'
const COMPANY_B = '66666666-6666-4666-8666-666666666666'
const PROJECT_A = '33333333-3333-4333-8333-333333333331'
const PROJECT_B = '44444444-4444-4444-8444-444444444444'
const companies = [
  { id: 11n, publicId: COMPANY_A, name: 'Alpha Company', displayName: 'Alpha' },
  { id: 12n, publicId: COMPANY_B, name: 'Beta Company', displayName: null },
]
const projects = [
  { id: 1n, publicId: PROJECT_A, name: 'Alpha Project', companyId: 11n, status: 'In Progress', priority: 'High', dueDate: day('2026-10-31'), createdAt: new Date('2026-09-20T04:00:00.000Z'), company: companies[0] },
  { id: 3n, publicId: PROJECT_B, name: 'Beta Project', companyId: 12n, status: 'Planning', priority: 'Low', dueDate: day('2026-10-31'), createdAt: new Date('2026-09-17T04:00:00.000Z'), company: companies[1] },
]

function day(value) {
  return new Date(`${value}T00:00:00.000Z`)
}

function workItem(id, overrides = {}) {
  const project = projects.find((row) => row.id === (overrides.projectId ?? 1n))
  return {
    id,
    publicId: id,
    title: id,
    kind: 'Task',
    priority: 'medium',
    role: 'Developer',
    status: 'todo',
    workDate: day('2026-10-01'),
    dueDate: day('2026-10-05'),
    createdAt: new Date('2026-10-01T02:00:00.000Z'),
    updatedAt: new Date('2026-10-01T03:00:00.000Z'),
    assigneeId: ownerId,
    project: { id: project.id, publicId: project.publicId, name: project.name, company: project.company },
    ...overrides,
    projectId: overrides.projectId ?? project.id,
  }
}

function makeFixtures() {
  const items = [
    workItem('overdue-open', { dueDate: day('2026-10-01') }),
    workItem('completed', { status: 'completed', priority: 'high', dueDate: day('2026-10-01') }),
    workItem('cancelled', { status: 'cancelled', dueDate: day('2026-10-01') }),
    workItem('urgent-today', { status: 'in_progress', priority: 'urgent', role: 'SA', workDate: day('2026-10-02'), dueDate: day('2026-10-02') }),
    workItem('fallback-due', { workDate: null, dueDate: day('2026-10-02') }),
    workItem('fallback-created', { workDate: null, dueDate: null, createdAt: new Date('2026-10-02T00:00:00.000Z') }),
    workItem('other-company', { projectId: 3n }),
    workItem('foreign-owner', { assigneeId: 8n }),
    workItem('previous-month', { workDate: day('2026-09-30'), dueDate: day('2026-09-30') }),
  ]
  const entries = [
    { id: 'time-1', userId: ownerId, date: day('2026-10-01'), hours: '0.1', description: 'Review, phase "one"', remarks: 'line one\nline two', workItemId: 'overdue-open' },
    { id: 'time-2', userId: ownerId, date: day('2026-10-02'), hours: '0.2', description: 'Completed work', remarks: null, workItemId: 'completed' },
    { id: 'time-3', userId: ownerId, date: day('2026-10-02'), hours: '4.9', description: 'Other company work', remarks: null, workItemId: 'other-company' },
    { id: 'time-4', userId: 8n, date: day('2026-10-02'), hours: '50', description: 'Foreign', remarks: null, workItemId: 'overdue-open' },
    { id: 'time-5', userId: ownerId, date: day('2026-09-30'), hours: '8', description: 'Earlier work', remarks: null, workItemId: 'overdue-open' },
    { id: 'time-legacy', userId: ownerId, date: day('2026-10-02'), hours: '0.000000000000000000000000000001', description: 'Legacy entry', remarks: null, workItemId: null },
  ]
  return { items, entries }
}

function matchesWorkItem(item, where = {}) {
  if (where.assigneeId && item.assigneeId !== where.assigneeId) return false
  if (where.projectId?.in && !where.projectId.in.some((id) => id === item.projectId)) return false
  if (where.projectId && !where.projectId.in && item.projectId !== where.projectId) return false
  if (where.kind && item.kind !== where.kind) return false
  if (Object.hasOwn(where, 'role') && item.role !== where.role) return false
  if (where.status && typeof where.status === 'string' && item.status !== where.status) return false
  if (where.status?.notIn && where.status.notIn.includes(item.status)) return false
  if (where.priority && item.priority !== where.priority) return false
  if (where.dueDate?.lt && (!item.dueDate || item.dueDate >= where.dueDate.lt)) return false
  if (where.project?.is?.companyId && item.project.company.id !== where.project.is.companyId) return false
  if (where.project?.is?.id && item.project.id !== where.project.is.id) return false
  if (where.workDate === null && item.workDate !== null) return false
  if (where.workDate?.gte && (!item.workDate || item.workDate < where.workDate.gte || item.workDate >= where.workDate.lt)) return false
  if (where.dueDate?.gte && (!item.dueDate || item.dueDate < where.dueDate.gte || item.dueDate >= where.dueDate.lt)) return false
  if (where.createdAt?.gte && (item.createdAt < where.createdAt.gte || item.createdAt >= where.createdAt.lt)) return false
  if (where.OR && !where.OR.some((clause) => matchesWorkItem(item, clause))) return false
  const and = Array.isArray(where.AND) ? where.AND : where.AND ? [where.AND] : []
  if (and.some((clause) => !matchesWorkItem(item, clause))) return false
  return true
}

function matchesTimeEntry(entry, where, items) {
  if (where.userId && entry.userId !== where.userId) return false
  if (where.date?.gte && (entry.date < where.date.gte || entry.date >= where.date.lt)) return false
  if (where.workItem?.is) {
    const item = items.find((row) => row.id === entry.workItemId)
    if (!item || !matchesWorkItem(item, where.workItem.is)) return false
  }
  return true
}

function orderRows(rows, orderBy) {
  const sorters = Array.isArray(orderBy) ? orderBy : [orderBy]
  return rows.sort((left, right) => {
    for (const sorter of sorters) {
      const [key, direction] = Object.entries(sorter)[0]
      const firstValue = left[key]
      const secondValue = right[key]
      if (firstValue === secondValue) continue
      const first = firstValue instanceof Date ? firstValue.getTime() : firstValue
      const second = secondValue instanceof Date ? secondValue.getTime() : secondValue
      if (first === null || first === undefined) return 1
      if (second === null || second === undefined) return -1
      const comparison = first < second ? -1 : 1
      return direction === 'desc' ? -comparison : comparison
    }
    return 0
  })
}

function takeRows(rows, take) {
  return take === undefined ? rows : rows.slice(0, take)
}

function fakeDatabase({ items, entries }) {
  const matchingEntries = (where) => entries.filter((entry) => matchesTimeEntry(entry, where, items))
  return {
    company: {
      findUnique: async ({ where }) => companies.find((company) => company.publicId === where.publicId || company.id === where.id) ?? null,
      findMany: async () => companies,
    },
    project: {
      findUnique: async ({ where }) => projects.find((project) => project.publicId === where.publicId || project.id === where.id) ?? null,
      findMany: async ({ where = {}, orderBy, take }) => takeRows(orderRows(projects.filter((project) =>
        (!where.id || project.id === where.id) && (!where.companyId || project.companyId === where.companyId),
      ).slice(), orderBy), take),
    },
    workItem: {
      count: async ({ where }) => items.filter((item) => matchesWorkItem(item, where)).length,
      findMany: async ({ where, orderBy, take }) => takeRows(orderRows(items.filter((item) => matchesWorkItem(item, where)), orderBy), take),
      groupBy: async ({ where }) => {
        const groups = new Map()
        for (const item of items.filter((row) => matchesWorkItem(row, where))) {
          const key = `${item.projectId}\u0000${item.status}`
          const current = groups.get(key) ?? { projectId: item.projectId, status: item.status, _count: { _all: 0 } }
          current._count._all += 1
          groups.set(key, current)
        }
        return [...groups.values()]
      },
    },
    timeEntry: {
      findMany: async ({ where, orderBy, take }) => takeRows(orderRows(matchingEntries(where), orderBy), take).map((entry) => {
        const item = items.find((row) => row.id === entry.workItemId)
        return {
          ...entry,
          publicId: entry.id,
          workItem: item ? { publicId: item.publicId, title: item.title, project: item.project } : null,
        }
      }),
      aggregate: async ({ where }) => ({ _sum: { hours: decimal.sumDecimalHours(matchingEntries(where).map((entry) => entry.hours)) } }),
      groupBy: async ({ where }) => {
        const groups = new Map()
        for (const entry of matchingEntries(where)) {
          const key = bangkok.serializeBangkokCalendarDate(entry.date)
          const current = groups.get(key) ?? { date: entry.date, values: [] }
          current.values.push(entry.hours)
          groups.set(key, current)
        }
        return [...groups.values()].map((group) => ({ date: group.date, _sum: { hours: decimal.sumDecimalHours(group.values) } }))
      },
    },
  }
}

function report(params = '', fixture = makeFixtures(), now = fixedNow) {
  return analysis.getAnalysisSummary(ownerId, new URLSearchParams(params), fakeDatabase(fixture), now)
}

const periodParams = 'startDate=2026-10-01&endDate=2026-10-31'

test('Analysis defaults to the current Bangkok calendar month independent of the host timezone', async () => {
  const previous = process.env.TZ
  try {
    for (const timezone of ['America/Los_Angeles', 'Asia/Tokyo']) {
      process.env.TZ = timezone
      const value = await report()
      assert.deepEqual(JSON.parse(JSON.stringify(value.meta.period)), { startDate: '2026-10-01', endDate: '2026-10-31' })
      assert.equal(value.meta.timezone, 'Asia/Bangkok')
      assert.equal(value.meta.metricVersion, dashboard.DASHBOARD_METRIC_VERSION)
    }
  } finally {
    if (previous === undefined) delete process.env.TZ
    else process.env.TZ = previous
  }
})

test('Analysis shares Dashboard WorkItem formulas, date anchors, owner scope, and exact hour filters', async () => {
  const fixture = makeFixtures()
  const params = new URLSearchParams(`${periodParams}&companyId=55555555-5555-4555-8555-555555555555`)
  const [analysisResult, dashboardResult] = await Promise.all([
    analysis.getAnalysisSummary(ownerId, params, fakeDatabase(fixture), fixedNow),
    dashboard.getDashboardSummary(ownerId, params, fakeDatabase(fixture), fixedNow),
  ])
  assert.equal(analysisResult.summary.total, dashboardResult.summary.total)
  assert.equal(analysisResult.summary.open, dashboardResult.summary.open)
  assert.equal(analysisResult.summary.completed, dashboardResult.summary.completed)
  assert.equal(analysisResult.summary.overdue, dashboardResult.summary.overdue)
  assert.equal(analysisResult.summary.completionRate, dashboardResult.summary.completionRate)
  assert.equal(analysisResult.summary.loggedHours, dashboardResult.summary.loggedHours)
  assert.equal(analysisResult.meta.metricDefinitions.cancelled, 'Owner WorkItems with status=cancelled')
  assert.equal('recentProjectProgress' in analysisResult.meta.metricDefinitions, false)
  assert.deepEqual(analysisResult.workItems.map((item) => item.id).sort(), ['overdue-open', 'completed', 'cancelled', 'urgent-today', 'fallback-due', 'fallback-created'].sort())
})

test('Analysis distinguishes open, completed, cancelled, overdue, and completion-rate definitions', async () => {
  const value = await report(periodParams)
  assert.equal(value.summary.total, 7)
  assert.equal(value.summary.completed, 1)
  assert.equal(value.summary.cancelled, 1)
  assert.equal(value.summary.open, 5)
  assert.equal(value.summary.overdue, 1)
  assert.equal(value.summary.completionRate, 1 / 6 * 100)
  assert.equal(value.breakdowns.status.find((row) => row.value === 'completed').count, 1)
  assert.equal(value.breakdowns.status.find((row) => row.value === 'cancelled').count, 1)
  assert.equal(value.workItems.some((item) => item.id === 'foreign-owner'), false)
})

test('Analysis overdue count comes from the same WorkItem snapshot as its source rows', async () => {
  const fixture = { items: [workItem('one-overdue', { dueDate: day('2026-10-01') })], entries: [] }
  const database = fakeDatabase(fixture)
  database.workItem.count = async () => {
    fixture.items.push(workItem('concurrent-overdue', { dueDate: day('2026-10-01') }))
    return 2
  }

  const value = await analysis.getAnalysisSummary(
    ownerId,
    new URLSearchParams(periodParams),
    database,
    fixedNow,
  )

  assert.equal(value.summary.total, 1)
  assert.equal(value.summary.overdue, 1)
  assert.deepEqual(value.workItems.map((item) => item.id), ['one-overdue'])
})

test('Company, Project, functional role, and kind filters constrain WorkItems and linked TimeEntries', async () => {
  const value = await report(`${periodParams}&companyId=55555555-5555-4555-8555-555555555555&projectId=33333333-3333-4333-8333-333333333331&role=Developer&kind=Task`)
  assert.deepEqual(value.workItems.map((item) => item.id).sort(), ['overdue-open', 'completed', 'cancelled', 'fallback-due', 'fallback-created'].sort())
  assert.deepEqual(value.timeEntries.map((entry) => entry.id).sort(), ['time-1', 'time-2'].sort())
  assert.equal(value.summary.loggedHours, '0.3')
  assert.deepEqual(JSON.parse(JSON.stringify(value.meta.filters)), {
    companyId: COMPANY_A, projectId: PROJECT_A, role: 'Developer', kind: 'Task',
  })
  assert.deepEqual(value.filterOptions.projects.map((project) => project.id).sort(), [PROJECT_A, PROJECT_B].sort())
  const noRole = await report(`${periodParams}&role=none`)
  assert.deepEqual(noRole.workItems.map((item) => item.id), [])
})

test('Analysis keeps Decimal sums exact and returns Bangkok date-only source rows and daily groups', async () => {
  const value = await report(periodParams)
  assert.equal(value.summary.loggedHours, '5.200000000000000000000000000001')
  assert.deepEqual(JSON.parse(JSON.stringify(value.loggedHoursByPeriod.map((row) => [row.startDate, row.endDate, row.hours]))), [
    ['2026-10-01', '2026-10-01', '0.1'],
    ['2026-10-02', '2026-10-02', '5.100000000000000000000000000001'],
  ])
  assert.equal(value.timeEntries.find((entry) => entry.id === 'time-1').date, '2026-10-01')
  assert.equal(value.workItems.find((item) => item.id === 'completed').status, 'completed')
  assert.equal(value.workItems.find((item) => item.id === 'urgent-today').status, 'in-progress')
})

test('Analysis groups hours by Bangkok week or month for longer reporting ranges', async () => {
  const fixture = makeFixtures()
  const weekly = await report('startDate=2026-08-01&endDate=2026-10-30', fixture)
  assert.equal(weekly.meta.loggedHoursGrouping, 'week')
  assert.deepEqual(JSON.parse(JSON.stringify(weekly.loggedHoursByPeriod.map((row) => [row.startDate, row.endDate]))), [
    ['2026-09-27', '2026-10-03'],
  ])
  const monthly = await report('startDate=2026-01-01&endDate=2026-10-31', fixture)
  assert.equal(monthly.meta.loggedHoursGrouping, 'month')
  assert.ok(monthly.loggedHoursByPeriod.some((row) => row.startDate === '2026-10-01' && row.endDate === '2026-10-31'))
  assert.equal(analysis.analysisGrouping({ startDate: '2026-10-01', endDate: '2026-10-31' }), 'day')
})

test('Analysis rejects incomplete, invalid, reversed dates and unsupported filters before querying', async () => {
  const untouched = {
    company: { findUnique: async () => assert.fail('invalid query must stop before database access') },
  }
  for (const query of [
    'startDate=2026-10-01',
    'startDate=2026-02-30&endDate=2026-03-01',
    'startDate=2026-10-02&endDate=2026-10-01',
    `${periodParams}&role=manager`,
    `${periodParams}&kind=Defect`,
  ]) {
    await assert.rejects(
      analysis.getAnalysisSummary(ownerId, new URLSearchParams(query), untouched, fixedNow),
      (error) => error.code === 'VALIDATION_ERROR',
    )
  }
})

test('Analysis returns safe relation errors for missing filters and Company/Project mismatch', async () => {
  await assert.rejects(report(`${periodParams}&companyId=aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa`), (error) => error.status === 404 && error.field === 'companyId')
  await assert.rejects(report(`${periodParams}&projectId=aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaab`), (error) => error.status === 404 && error.field === 'projectId')
  await assert.rejects(report(`${periodParams}&companyId=66666666-6666-4666-8666-666666666666&projectId=33333333-3333-4333-8333-333333333331`), (error) => error.code === 'RELATION_MISMATCH')
})

test('Analysis returns real zero totals and empty source sets for a no-match range', async () => {
  const value = await report('startDate=2020-01-01&endDate=2020-01-07', { items: [], entries: [] })
  assert.deepEqual(JSON.parse(JSON.stringify(value.summary)), {
    total: 0, open: 0, completed: 0, cancelled: 0, overdue: 0, completionRate: 0, loggedHours: '0',
  })
  assert.equal(value.workItems.length, 0)
  assert.equal(value.timeEntries.length, 0)
  assert.ok(value.breakdowns.status.every((row) => row.count === 0))
})

test('Analysis work-item links preserve period and filters and open an exact source record', () => {
  const href = sourceLinks.analysisWorkItemsHref(
    { companyId: 'company-a', projectId: 'project-a', role: 'Developer', kind: 'Task' },
    { startDate: '2026-10-01', endDate: '2026-10-31' },
    { status: 'completed', workItemId: 'work-1' },
  )
  const url = new URL(href, 'http://local')
  assert.equal(url.pathname, '/work-items')
  assert.equal(url.searchParams.get('startDate'), '2026-10-01')
  assert.equal(url.searchParams.get('endDate'), '2026-10-31')
  assert.equal(url.searchParams.get('companyId'), 'company-a')
  assert.equal(url.searchParams.get('projectId'), 'project-a')
  assert.equal(url.searchParams.get('role'), 'Developer')
  assert.equal(url.searchParams.get('kind'), 'Task')
  assert.equal(url.searchParams.get('status'), 'completed')
  assert.equal(url.searchParams.get('workItemId'), 'work-1')
})

test('Analysis Daily Work links narrow the same filters to one selected Bangkok date', () => {
  const href = sourceLinks.analysisDailyWorkHref(
    { companyId: 'company-a', projectId: 'project-a', role: 'Developer', kind: 'Task' },
    { startDate: '2026-10-02', endDate: '2026-10-02' },
  )
  const url = new URL(href, 'http://local')
  assert.equal(url.pathname, '/daily-work')
  assert.equal(url.searchParams.get('startDate'), '2026-10-02')
  assert.equal(url.searchParams.get('endDate'), '2026-10-02')
  assert.equal(url.searchParams.get('projectId'), 'project-a')
  assert.equal(url.searchParams.get('kind'), 'Task')
})

test('Analysis CSV exports summary, breakdowns, source rows, and safely escaped source text', async () => {
  const value = await report(periodParams)
  const csv = analysisExport.generateAnalysisCsv(value)
  assert.ok(csv.startsWith('\uFEFF"recordType","date","id"'))
  assert.ok(csv.includes('"metric","","","Logged hours"'))
  assert.ok(csv.includes('"breakdown","","","completed"'))
  assert.ok(csv.includes('"work-item","2026-10-01","overdue-open"'))
  assert.ok(csv.includes('"daily-work","2026-10-01","time-1"'))
  assert.ok(csv.includes('Review, phase ""one"" · line one'))
  assert.ok(csv.includes('line one\nline two"'))
  assert.ok(csv.includes('"0.000000000000000000000000000001"'))
})

test('Analysis CSV neutralizes spreadsheet formulas in source text', async () => {
  const value = await report(periodParams)
  value.workItems[0].title = '=1+1'
  value.workItems[1].title = '  +SUM(1,2)'
  value.workItems[2].title = '@HYPERLINK("https://example.invalid")'
  value.workItems[3].title = '\uFEFF=1+1'
  value.timeEntries[0].description = '\t=1+1'

  const csv = analysisExport.generateAnalysisCsv(value)

  assert.ok(csv.includes('"\'=1+1"'))
  assert.ok(csv.includes('"\'  +SUM(1,2)"'))
  assert.ok(csv.includes('"\'@HYPERLINK(""https://example.invalid"")"'))
  assert.ok(csv.includes('"\'\uFEFF=1+1"'))
  assert.ok(csv.includes('"\'\t=1+1'))
})

test('Analysis summary API requires owner access, validates filters, disables caching, and hides dependency details', async () => {
  class MockDashboardQueryError extends Error {
    constructor(status, code, message, field) {
      super(message)
      this.status = status
      this.code = code
      this.field = field
    }
  }
  const state = { ownerError: null, summaryError: null, params: null }
  const route = loadTs('../../app/api/analysis/summary/route.ts', {
    'next/server': { NextResponse: { json: (body, init = {}) => ({ status: init.status ?? 200, body, headers: init.headers ?? {} }) } },
    '@/lib/owner': {
      getOwner: async () => {
        if (state.ownerError) throw state.ownerError
        return { id: OWNER_PUBLIC, internalId: ownerId }
      },
      ownerErrorResponse: (error) => error.message === 'unauthenticated'
        ? { status: 401, body: { error: { code: 'OWNER_UNAUTHENTICATED' } } }
        : null,
    },
    '@/lib/dashboard': { DashboardQueryError: MockDashboardQueryError },
    '@/lib/analysis': {
      getAnalysisSummary: async (id, params) => {
        assert.equal(id, ownerId)
        state.params = params
        if (state.summaryError) throw state.summaryError
        return { summary: { total: 1 } }
      },
    },
  }, { console: { error: () => {} } })

  const ok = await route.GET(new Request('http://local/api/analysis/summary?companyId=55555555-5555-4555-8555-555555555555'))
  assert.equal(ok.status, 200)
  assert.equal(ok.headers['Cache-Control'], 'no-store')
  assert.equal(state.params.get('companyId'), COMPANY_A)

  state.summaryError = new MockDashboardQueryError(400, 'VALIDATION_ERROR', 'Invalid date range', 'startDate')
  const invalid = await route.GET(new Request('http://local/api/analysis/summary'))
  assert.equal(invalid.status, 400)
  assert.equal(invalid.body.error.field, 'startDate')

  state.summaryError = new Error('private database connection detail')
  const failure = await route.GET(new Request('http://local/api/analysis/summary'))
  assert.equal(failure.status, 500)
  assert.equal(JSON.stringify(failure.body).includes('private database connection detail'), false)

  state.ownerError = new Error('unauthenticated')
  state.summaryError = null
  const unauthenticated = await route.GET(new Request('http://local/api/analysis/summary'))
  assert.equal(unauthenticated.status, 401)
  assert.equal(unauthenticated.body.error.code, 'OWNER_UNAUTHENTICATED')
})

test('Analysis page renders live data, filters, traceable tables, export, and safe states without sample datasets', () => {
  const page = readFileSync(new URL('../../app/analysis/page.tsx', import.meta.url), 'utf8') + readFileSync(new URL('../../components/page/analysis/analysis-charts.tsx', import.meta.url), 'utf8')
  const tables = readFileSync(new URL('../../components/page/analysis/report-tables.tsx', import.meta.url), 'utf8')
  const route = readFileSync(new URL('../../app/api/analysis/summary/route.ts', import.meta.url), 'utf8')
  assert.match(route, /getOwner\(\)/)
  assert.match(route, /getAnalysisSummary\(owner\.internalId/)
  assert.match(page, /\/api\/analysis\/summary/)
  assert.match(page, /<WorkItemsTable report={report}/)
  assert.match(page, /<DailyWorkTable report={report}/)
  assert.match(tables, /analysisWorkItemsHref\(report\.meta\.filters, report\.meta\.period, \{ workItemId: item\.id \}\)/)
  assert.match(tables, /analysisDailyWorkHref\(report\.meta\.filters, \{ startDate: entry\.date, endDate: entry\.date \}\)/)
  assert.match(page, /generateAnalysisCsv\(report\)/)
  assert.match(page, /ส่งออก CSV สำเร็จ/)
  assert.match(page, /ส่งออก CSV ไม่สำเร็จ/)
  assert.equal((page.match(/role="status"/g) ?? []).length, 1, 'only the loading region announces status; export keeps its output element')
  assert.match(page, /!report && <ContentLoadingSkeleton layout="report"/)
  assert.match(page, /<output className="block text-sm text-muted-foreground" aria-live="polite">\{exportMessage\.text\}<\/output>/)
  assert.match(page, /aria-busy="true"/)
  assert.match(page, /<PageState kind="error" title="โหลด Analysis ไม่สำเร็จ"/)
  assert.match(page, /min-w-0/)
  assert.match(page, /ChartContainer/)
  assert.match(page, /\[requestQuery, reloadKey\]/)
  assert.match(page, /setReloadKey\(\(current\) => current \+ 1\)/)
  assert.match(page, /shape=\{\(props: unknown\) => <StatusChartLinkBar/)
  assert.match(page, /import \{ renderHoursChartDot \} from '.\/hours-chart-dot'/)
  assert.match(page, /dot=\{renderHoursChartDot\}/)
  const chartDot = readFileSync(new URL('../../components/page/analysis/hours-chart-dot.tsx', import.meta.url), 'utf8')
  assert.match(chartDot, /<Link key=\{payload\.startDate\} href=\{payload\.href\} aria-label=\{payload\.accessibleName\}>/)
  assert.match(page, /<Link href=\{payload\.href\} aria-label=\{payload\.accessibleName\}>/)
  assert.match(page, /analysisWorkItemsHref\(sourceFilters, period, \{ status: row\.value \}\)/)
  assert.match(page, /analysisDailyWorkHref\(sourceFilters, \{ startDate: row\.startDate, endDate: row\.endDate \}\)/)
  assert.match(page, /projects\.filter\(\(project\) => project\.companyId === draftFilters\.companyId\)/)
  assert.doesNotMatch(page, /projectStatusData|teamPerformanceData|monthlyTrendsData|budgetAnalysisData|taskCompletionData/)
})

test('Work Items page opens an exact Analysis deep-link record and removes its query on close', () => {
  const page = readFileSync(new URL('../../app/work-items/page.tsx', import.meta.url), 'utf8')
  assert.match(page, /get\('workItemId'\)/)
  assert.match(page, /api\/work-items\/\$\{encodeURIComponent\(requestedWorkItemId\)\}/)
  assert.match(page, /params\.delete\('workItemId'\)/)
})
