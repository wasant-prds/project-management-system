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

function loadFunction(path, functionName) {
  const source = ts.createSourceFile(path, readFileSync(new URL(path, import.meta.url), 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  const declaration = source.statements.find((statement) =>
    ts.isFunctionDeclaration(statement) && statement.name?.text === functionName,
  )
  assert.ok(declaration, `Missing ${functionName} in ${path}`)
  const output = ts.transpileModule(`${declaration.getText(source)}\nmodule.exports = ${functionName}`, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText
  const loaded = { exports: {} }
  vm.runInNewContext(output, { module: loaded, exports: loaded.exports, URLSearchParams }, { filename: path })
  return loaded.exports
}

const bangkok = loadTs('../../lib/bangkok-datetime.ts')
const workItems = loadTs('../../lib/work-items.ts')
const dashboard = loadTs('../../lib/dashboard.ts', {
  '@/lib/db': { prisma: {} },
  '@/lib/bangkok-datetime': bangkok,
  '@/lib/project-management': { completionRate: (total, completed, cancelled) => {
    const eligible = total - cancelled
    return eligible === 0 ? 0 : completed / eligible * 100
  } },
  '@/lib/work-items': workItems,
})
const links = loadTs('../../lib/dashboard-links.ts', { '@/lib/dashboard': {} })

const fixedNow = new Date('2026-10-02T04:00:00.000Z')
const OWNER_PUBLIC = '11111111-1111-4111-8111-111111111111'
const ownerId = 7n
const COMPANY_A = '55555555-5555-4555-8555-555555555555'
const COMPANY_B = '66666666-6666-4666-8666-666666666666'
const PROJECT_A = '33333333-3333-4333-8333-333333333331'
const PROJECT_A2 = '33333333-3333-4333-8333-333333333332'
const PROJECT_B = '44444444-4444-4444-8444-444444444444'
const MISSING_PUBLIC = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const companies = [
  { id: 11n, publicId: COMPANY_A, name: 'Alpha Company', displayName: 'Alpha' },
  { id: 12n, publicId: COMPANY_B, name: 'Beta Company', displayName: null },
]
const projects = [
  { id: 1n, publicId: PROJECT_A, name: 'Alpha Project', companyId: 11n, status: 'In Progress', priority: 'High', dueDate: new Date('2026-10-31T00:00:00.000Z'), createdAt: new Date('2026-09-20T04:00:00.000Z'), company: companies[0] },
  { id: 2n, publicId: PROJECT_A2, name: 'Alpha Project Two', companyId: 11n, status: 'Planning', priority: 'Medium', dueDate: new Date('2026-10-31T00:00:00.000Z'), createdAt: new Date('2026-09-18T04:00:00.000Z'), company: companies[0] },
  { id: 3n, publicId: PROJECT_B, name: 'Beta Project', companyId: 12n, status: 'Planning', priority: 'Low', dueDate: new Date('2026-10-31T00:00:00.000Z'), createdAt: new Date('2026-09-17T04:00:00.000Z'), company: companies[1] },
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
    projectId: project.id,
    assigneeId: ownerId,
    project: { id: project.id, publicId: project.publicId, name: project.name, company: project.company },
    ...overrides,
    projectId: overrides.projectId ?? project.id,
  }
}

function makeFixtures() {
  const items = [
    workItem('open-overdue', { dueDate: day('2026-10-01') }),
    workItem('completed', { status: 'completed', dueDate: day('2026-10-01'), priority: 'high' }),
    workItem('cancelled', { status: 'cancelled', dueDate: day('2026-10-01') }),
    workItem('due-today', { status: 'in_progress', workDate: day('2026-10-02'), dueDate: day('2026-10-02'), priority: 'urgent' }),
    workItem('urgent', { priority: 'urgent', dueDate: day('2026-10-03'), workDate: day('2026-10-02'), role: 'SA' }),
    workItem('previous-month', { workDate: day('2026-09-30'), dueDate: day('2026-09-30') }),
    workItem('fallback-due', { workDate: null, dueDate: day('2026-10-02') }),
    workItem('fallback-created', { workDate: null, dueDate: null, createdAt: new Date('2026-10-02T00:00:00.000Z') }),
    workItem('foreign-owner', { assigneeId: 8n }),
    workItem('other-company', { projectId: 3n }),
    workItem('other-project', { projectId: 2n }),
  ]
  const entries = [
    { id: 'time-1', userId: ownerId, date: day('2026-10-01'), hours: '0.1', workItemId: 'open-overdue' },
    { id: 'time-2', userId: ownerId, date: day('2026-10-02'), hours: '0.2', workItemId: 'completed' },
    { id: 'time-3', userId: ownerId, date: day('2026-10-02'), hours: '4.9', workItemId: 'other-project' },
    { id: 'time-4', userId: 8n, date: day('2026-10-02'), hours: '50', workItemId: 'open-overdue' },
    { id: 'time-5', userId: ownerId, date: day('2026-09-30'), hours: '8', workItemId: 'open-overdue' },
    { id: 'time-legacy', userId: ownerId, date: day('2026-10-02'), hours: '0.000000000000000000000000000001', workItemId: null },
  ]
  return { items, entries }
}

function inDateRange(value, condition) {
  if (value === null || value === undefined) return false
  if (condition.gte && value < condition.gte) return false
  if (condition.lt && value >= condition.lt) return false
  return true
}

function matchesWorkItem(item, where = {}) {
  if (where.assigneeId && item.assigneeId !== where.assigneeId) return false
  if (where.id && typeof where.id === 'string' && item.id !== where.id) return false
  if (where.projectId?.in && !where.projectId.in.some((id) => id === item.projectId)) return false
  if (where.projectId !== undefined && !where.projectId.in && item.projectId !== where.projectId) return false
  if (where.kind && item.kind !== where.kind) return false
  if (Object.hasOwn(where, 'role') && item.role !== where.role) return false
  if (typeof where.status === 'string' && item.status !== where.status) return false
  if (where.status?.notIn && where.status.notIn.includes(item.status)) return false
  if (where.priority && item.priority !== where.priority) return false
  if (where.dueDate && !inDateRange(item.dueDate, where.dueDate)) return false
  if (where.workDate === null && item.workDate !== null) return false
  if (where.workDate && !inDateRange(item.workDate, where.workDate)) return false
  if (where.createdAt && !inDateRange(item.createdAt, where.createdAt)) return false
  if (where.project?.is?.companyId && item.project.company.id !== where.project.is.companyId) return false
  if (where.project?.is?.id && item.project.id !== where.project.is.id) return false
  if (where.OR && !where.OR.some((clause) => matchesWorkItem(item, clause))) return false
  const and = Array.isArray(where.AND) ? where.AND : where.AND ? [where.AND] : []
  if (and.some((clause) => !matchesWorkItem(item, clause))) return false
  return true
}

function matchesTimeEntry(entry, where, items) {
  if (where.userId && entry.userId !== where.userId) return false
  if (where.date && !inDateRange(entry.date, where.date)) return false
  if (where.workItem?.is) {
    const item = items.find((row) => row.id === entry.workItemId)
    if (!item || !matchesWorkItem(item, where.workItem.is)) return false
  }
  return true
}

function sumDecimals(values) {
  const scaleOf = (value) => (value.split('.')[1] ?? '').length
  const scale = Math.max(0, ...values.map(scaleOf))
  const total = values.reduce((sum, value) => {
    const [integer, fraction = ''] = value.split('.')
    return sum + BigInt(`${integer}${fraction.padEnd(scale, '0')}`)
  }, 0n)
  const digits = total.toString().padStart(scale + 1, '0')
  if (scale === 0) return digits
  const integer = digits.slice(0, -scale)
  const fraction = digits.slice(-scale).replace(/0+$/, '')
  return fraction ? `${integer}.${fraction}` : integer
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
      if (first === second) continue
      if (first === null || first === undefined) return 1
      if (second === null || second === undefined) return -1
      const comparison = first < second ? -1 : 1
      return direction === 'desc' ? -comparison : comparison
    }
    return 0
  })
}

function fakeDatabase({ items, entries }) {
  const aggregateEntries = (where) => entries.filter((entry) => matchesTimeEntry(entry, where, items))
  return {
    company: {
      findUnique: async ({ where }) => companies.find((company) => company.publicId === where.publicId || company.id === where.id) ?? null,
      findMany: async () => companies,
    },
    project: {
      findUnique: async ({ where }) => projects.find((project) => project.publicId === where.publicId || project.id === where.id) ?? null,
      findMany: async ({ where = {}, orderBy, take }) => orderRows(projects.filter((project) =>
        (!where.id || project.id === where.id) && (!where.companyId || project.companyId === where.companyId),
      ).slice(), orderBy).slice(0, take),
    },
    workItem: {
      count: async ({ where }) => items.filter((item) => matchesWorkItem(item, where)).length,
      findMany: async ({ where, orderBy, take }) => orderRows(items.filter((item) => matchesWorkItem(item, where)), orderBy).slice(0, take),
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
      aggregate: async ({ where }) => ({ _sum: { hours: sumDecimals(aggregateEntries(where).map((entry) => entry.hours)) } }),
      groupBy: async ({ where }) => {
        const groups = new Map()
        for (const entry of aggregateEntries(where)) {
          const date = bangkok.serializeBangkokCalendarDate(entry.date)
          const current = groups.get(date) ?? { date: entry.date, values: [] }
          current.values.push(entry.hours)
          groups.set(date, current)
        }
        return [...groups.values()].map((group) => ({ date: group.date, _sum: { hours: sumDecimals(group.values) } }))
          .sort((left, right) => left.date - right.date)
      },
    },
  }
}

function summarize(params = '', fixture = makeFixtures(), now = fixedNow) {
  return dashboard.getDashboardSummary(ownerId, new URLSearchParams(params), fakeDatabase(fixture), now)
}

test('Dashboard defaults to the complete Bangkok calendar month independent of the host timezone', () => {
  const previous = process.env.TZ
  try {
    for (const timezone of ['America/Los_Angeles', 'Asia/Tokyo']) {
      process.env.TZ = timezone
      const result = dashboard.parseDashboardFilters(new URLSearchParams(), fixedNow)
      assert.equal(result.filters.startDate, '2026-10-01')
      assert.equal(result.filters.endDate, '2026-10-31')
      assert.equal(result.range.start.toISOString(), '2026-10-01T00:00:00.000Z')
      assert.equal(result.range.end.toISOString(), '2026-11-01T00:00:00.000Z')
    }
  } finally {
    if (previous === undefined) delete process.env.TZ
    else process.env.TZ = previous
  }
})

test('Dashboard requires a valid inclusive date pair and validates shared role and kind filters', () => {
  assert.equal(dashboard.parseDashboardFilters(new URLSearchParams('startDate=2026-10-01')).error.field, 'startDate')
  assert.equal(dashboard.parseDashboardFilters(new URLSearchParams('startDate=2026-02-30&endDate=2026-03-01')).error.code, 'VALIDATION_ERROR')
  assert.equal(dashboard.parseDashboardFilters(new URLSearchParams('startDate=2026-10-02&endDate=2026-10-01')).error.code, 'VALIDATION_ERROR')
  assert.equal(dashboard.parseDashboardFilters(new URLSearchParams('role=manager')).error.field, 'role')
  assert.equal(dashboard.parseDashboardFilters(new URLSearchParams('kind=Defect')).error.field, 'kind')
  const valid = dashboard.parseDashboardFilters(new URLSearchParams('startDate=2026-10-01&endDate=2026-10-02&role=none&kind=Task'))
  assert.deepEqual(JSON.parse(JSON.stringify(valid.filters)), {
    startDate: '2026-10-01', endDate: '2026-10-02', companyId: null, projectId: null, role: 'none', kind: 'Task',
  })
})

test('Dashboard treats empty form selections as no filters', () => {
  const submittedDefaults = dashboard.parseDashboardFilters(new URLSearchParams(
    'startDate=2026-10-01&endDate=2026-10-31&companyId=&projectId=&role=&kind=',
  ))
  assert.equal(submittedDefaults.error, undefined)
  assert.deepEqual(JSON.parse(JSON.stringify(submittedDefaults.filters)), {
    startDate: '2026-10-01', endDate: '2026-10-31', companyId: null, projectId: null, role: null, kind: null,
  })
})

test('Dashboard applies shared WorkItem date anchors and excludes other owners and Companies', async () => {
  const result = await summarize('startDate=2026-10-01&endDate=2026-10-02&companyId=55555555-5555-4555-8555-555555555555')
  assert.equal(result.summary.total, 8)
  assert.equal(result.summary.completed, 1)
  assert.equal(result.summary.open, 6)
  assert.equal(result.summary.overdue, 1)
  assert.equal(result.summary.recentWorkItems.length, 5)
  assert.equal(result.summary.recentWorkItems.some((item) => item.id === 'other-company'), false)
  assert.equal(result.summary.recentWorkItems.some((item) => item.id === 'foreign-owner'), false)
  assert.equal(result.summary.overdueWorkItems.map((item) => item.id).join(','), 'open-overdue')
  assert.equal(result.summary.urgentWorkItems.map((item) => item.id).join(','), 'due-today,urgent')
})

test('Dashboard excludes completed and cancelled from Open and Completed and uses the shared completion formula', async () => {
  const result = await summarize('startDate=2026-10-01&endDate=2026-10-02')
  assert.equal(result.summary.total, 9)
  assert.equal(result.summary.completed, 1)
  assert.equal(result.summary.open, 7)
  assert.equal(result.summary.completionRate, 1 / 8 * 100)
  assert.equal(result.summary.overdue, 1)
  assert.equal(result.summary.overdueWorkItems.some((item) => item.id === 'cancelled'), false)
})

test('Dashboard period and Company/Project/role/kind filters constrain TimeEntry through its WorkItem', async () => {
  const result = await summarize('startDate=2026-10-01&endDate=2026-10-02&companyId=55555555-5555-4555-8555-555555555555&projectId=33333333-3333-4333-8333-333333333331&role=Developer&kind=Task')
  assert.deepEqual(result.summary.recentWorkItems.map((item) => item.id).sort(), ['open-overdue', 'completed', 'due-today', 'fallback-due', 'fallback-created'].sort())
  assert.equal(result.summary.total, 6)
  assert.equal(result.summary.loggedHours, '0.3')
  assert.deepEqual(result.summary.loggedHoursByDate.map((item) => [item.date, item.hours]), [
    ['2026-10-01', '0.1'], ['2026-10-02', '0.2'],
  ])
  assert.equal(result.meta.timezone, 'Asia/Bangkok')
  assert.equal(result.meta.metricVersion, 'shared-work-v1')
  assert.equal(result.meta.metricDefinitions.open, 'total - completed - cancelled')
  assert.equal(result.meta.metricDefinitions.workItemDateAnchor, 'workDate ?? dueDate ?? createdAt')
  assert.deepEqual(JSON.parse(JSON.stringify(result.meta.filters)), {
    companyId: COMPANY_A, projectId: PROJECT_A, role: 'Developer', kind: 'Task',
  })
})

test('Dashboard preserves exact Decimal sums for unfiltered Daily Work and serializes date fields as Bangkok calendar dates', async () => {
  const result = await summarize('startDate=2026-10-01&endDate=2026-10-02')
  assert.equal(result.summary.loggedHours, '5.200000000000000000000000000001')
  assert.equal(result.summary.loggedHoursByDate.find((item) => item.date === '2026-10-02').hours, '5.100000000000000000000000000001')
  assert.equal(result.summary.recentWorkItems.find((item) => item.id === 'open-overdue').dueDate, '2026-10-01')
})

test('Dashboard recent Project progress excludes cancelled from the denominator', async () => {
  const result = await summarize('startDate=2026-10-01&endDate=2026-10-02&companyId=55555555-5555-4555-8555-555555555555&projectId=33333333-3333-4333-8333-333333333331')
  const project = result.summary.recentProjects[0]
  assert.equal(project.id, PROJECT_A)
  assert.equal(project.company.displayName, 'Alpha')
  assert.equal(project.progress, 1 / 7 * 100)
  const onlyCancelled = fakeDatabase({
    items: [workItem('cancel-only', { status: 'cancelled' })],
    entries: [],
  })
  const cancelledSummary = await dashboard.getDashboardSummary(ownerId, new URLSearchParams('startDate=2026-10-01&endDate=2026-10-02&projectId=33333333-3333-4333-8333-333333333331'), onlyCancelled, fixedNow)
  assert.equal(cancelledSummary.summary.recentProjects[0].progress, 0)
})

test('Dashboard validates missing resources and Company/Project relationship conflicts', async () => {
  await assert.rejects(summarize('startDate=2026-10-01&endDate=2026-10-02&companyId=aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'), (error) => error.status === 404 && error.field === 'companyId')
  await assert.rejects(summarize('startDate=2026-10-01&endDate=2026-10-02&projectId=aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaab'), (error) => error.status === 404 && error.field === 'projectId')
  await assert.rejects(summarize('startDate=2026-10-01&endDate=2026-10-02&companyId=66666666-6666-4666-8666-666666666666&projectId=33333333-3333-4333-8333-333333333331'), (error) => error.code === 'RELATION_MISMATCH' && error.status === 400)
})

test('Dashboard returns real zero totals and explicit empty collections when no matching records exist', async () => {
  const result = await summarize('startDate=2026-10-01&endDate=2026-10-02&companyId=55555555-5555-4555-8555-555555555555', { items: [], entries: [] })
  assert.deepEqual(JSON.parse(JSON.stringify(result.summary)), {
    total: 0,
    open: 0,
    completed: 0,
    overdue: 0,
    completionRate: 0,
    loggedHours: '0',
    recentWorkItems: [],
    urgentWorkItems: [],
    overdueWorkItems: [],
    recentProjects: [
      { id: PROJECT_A, name: 'Alpha Project', status: 'In Progress', priority: 'High', dueDate: '2026-10-31', createdAt: '2026-09-20T04:00:00.000+07:00', company: { id: COMPANY_A, name: 'Alpha Company', displayName: 'Alpha' }, progress: 0 },
      { id: PROJECT_A2, name: 'Alpha Project Two', status: 'Planning', priority: 'Medium', dueDate: '2026-10-31', createdAt: '2026-09-18T04:00:00.000+07:00', company: { id: COMPANY_A, name: 'Alpha Company', displayName: 'Alpha' }, progress: 0 },
    ],
    loggedHoursByDate: [],
  })
})

test('Dashboard source links keep all filters and add the selected metric condition', () => {
  const filters = { startDate: '2026-10-01', endDate: '2026-10-31', companyId: 'company a', projectId: 'project-1', role: 'infra', kind: 'Issue' }
  const workItemsUrl = new URL(links.dashboardWorkItemsHref(filters, { overdue: true }), 'http://local')
  assert.equal(workItemsUrl.pathname, '/work-items')
  assert.equal(workItemsUrl.searchParams.get('startDate'), filters.startDate)
  assert.equal(workItemsUrl.searchParams.get('endDate'), filters.endDate)
  assert.equal(workItemsUrl.searchParams.get('companyId'), 'company a')
  assert.equal(workItemsUrl.searchParams.get('projectId'), filters.projectId)
  assert.equal(workItemsUrl.searchParams.get('role'), filters.role)
  assert.equal(workItemsUrl.searchParams.get('kind'), filters.kind)
  assert.equal(workItemsUrl.searchParams.get('overdue'), 'true')
  const dailyUrl = new URL(links.dashboardDailyWorkHref(filters, { startDate: '2026-10-02', endDate: '2026-10-02' }), 'http://local')
  assert.equal(dailyUrl.pathname, '/daily-work')
  assert.equal(dailyUrl.searchParams.get('startDate'), '2026-10-02')
  assert.equal(dailyUrl.searchParams.get('projectId'), filters.projectId)
})

test('Work Items calendar period query replaces Dashboard dates and retains the other active filters', () => {
  const workItemQuery = loadFunction('../../app/work-items/page.tsx', 'workItemQuery')
  const query = new URLSearchParams(workItemQuery({
    year: '2025', month: '3', project: 'project-1', company: 'company-1', dateRange: null,
    search: 'review', status: 'in-progress', priority: 'high', role: 'infra', kind: 'Issue',
    openOnly: true, overdueOnly: true, includeYears: false,
  }))
  assert.equal(query.get('year'), '2025')
  assert.equal(query.get('month'), '3')
  assert.equal(query.has('startDate'), false)
  assert.equal(query.has('endDate'), false)
  assert.equal(query.get('companyId'), 'company-1')
  assert.equal(query.get('projectId'), 'project-1')
  assert.equal(query.get('kind'), 'Issue')
  assert.equal(query.get('search'), 'review')
  assert.equal(query.get('openOnly'), 'true')
  assert.equal(query.get('overdue'), 'true')
})

test('Clearing Daily Work Dashboard filters removes them from the URL and keeps the selected date', () => {
  const href = links.dailyWorkHrefWithoutDashboardFilters(
    'startDate=2026-10-01&endDate=2026-10-31&companyId=55555555-5555-4555-8555-555555555555&projectId=33333333-3333-4333-8333-333333333331&role=Developer&kind=Task&date=2026-10-01&view=week',
    '2026-10-02',
  )
  const url = new URL(href, 'http://local')
  assert.equal(url.pathname, '/daily-work')
  assert.equal(url.searchParams.toString(), 'view=week&date=2026-10-02')
})

test('Dashboard page and chart render live query props and retain loading, empty, and safe error states', () => {
  const page = readFileSync(new URL('../../app/page.tsx', import.meta.url), 'utf8')
  const chart = readFileSync(new URL('../../components/layout/dashboard-charts.tsx', import.meta.url), 'utf8')
  const loading = readFileSync(new URL('../../components/layout/dashboard-loading.tsx', import.meta.url), 'utf8')
  const workItemsPage = readFileSync(new URL('../../app/work-items/page.tsx', import.meta.url), 'utf8')
  const dailyWorkPage = readFileSync(new URL('../../app/daily-work/page.tsx', import.meta.url), 'utf8')
  assert.match(page, /getDashboardSummary\(owner\.internalId, params\)/)
  assert.match(page, /summary\.recentWorkItems/)
  assert.match(page, /summary\.urgentWorkItems/)
  assert.match(page, /summary\.overdueWorkItems/)
  assert.match(page, /ไม่พบ Work Items, Daily Work หรือ Projects ในช่วงและตัวกรองนี้/)
  assert.match(page, /ไม่สามารถเชื่อมต่อเพื่ออ่านข้อมูลจริงได้/)
  assert.match(page, /dashboardWorkItemsHref\(filters, \{ status: 'completed' \}\)/)
  assert.match(page, /<Suspense fallback=\{<DashboardLoading \/>\}>/)
  assert.match(chart, /data\.map\(\(point\) =>/)
  assert.match(chart, /min-w-0/)
  assert.doesNotMatch(chart, /projectCompletionData|taskActivityData|\{ month: ['"]Jan/)
  assert.match(loading, /aria-busy="true"/)
  assert.match(workItemsPage, /useSearchParams\(\)/)
  assert.match(workItemsPage, /new URLSearchParams\(searchParamsValue\)/)
  assert.match(workItemsPage, /\}, \[searchParamsValue\]\)/)
  assert.match(workItemsPage, /params\.get\('startDate'\)/)
  assert.match(workItemsPage, /params\.get\('openOnly'\)/)
  assert.match(workItemsPage, /ตัวกรองจาก Dashboard/)
  assert.match(workItemsPage, /href="\/work-items"[^\n]*>ล้างตัวกรอง Dashboard/)
  assert.match(workItemsPage, /onClick=\{\(\) => applyCalendarPeriod\(yearFilter, monthFilter\)\}/)
  assert.match(workItemsPage, /startDate && endDate \? startDate\.slice\(0, 4\)/)
  assert.match(workItemsPage, /setDashboardDateRange\(null\)[\s\S]*router\.replace\(`\/work-items\?/)
  assert.match(workItemsPage, /onValueChange=\{\(value\) => applyCalendarPeriod\(value, monthFilter\)\}/)
  assert.match(workItemsPage, /onValueChange=\{\(value\) => applyCalendarPeriod\(yearFilter, value\)\}/)
  assert.match(dailyWorkPage, /useSearchParams\(\)/)
  assert.match(dailyWorkPage, /new URLSearchParams\(searchParamsValue\)/)
  assert.match(dailyWorkPage, /\}, \[searchParamsValue\]\)/)
  assert.match(dailyWorkPage, /clearDashboardFilters\(currentBangkokCalendarDate\(\)\)/)
  assert.match(dailyWorkPage, /router\.replace\(dailyWorkHrefWithoutDashboardFilters\(searchParamsValue, selectedDate\)/)
  assert.match(dailyWorkPage, /params\.get\("startDate"\)/)
  assert.match(dailyWorkPage, /dashboardFilters\.companyId/)
})

test('Dashboard API requires owner access and returns safe validation and dependency errors', async () => {
  class MockDashboardQueryError extends Error {
    constructor(status, code, message, field) {
      super(message)
      this.status = status
      this.code = code
      this.field = field
    }
  }
  const state = { ownerError: null, summaryError: null, params: null }
  const route = loadTs('../../app/api/dashboard/summary/route.ts', {
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
    '@/lib/dashboard': {
      DashboardQueryError: MockDashboardQueryError,
      getDashboardSummary: async (id, params) => {
        assert.equal(id, ownerId)
        state.params = params
        if (state.summaryError) throw state.summaryError
        return { summary: { total: 1 } }
      },
    },
  }, { console: { error: () => {} } })
  const ok = await route.GET(new Request('http://local/api/dashboard/summary?companyId=55555555-5555-4555-8555-555555555555'))
  assert.equal(ok.status, 200)
  assert.equal(ok.headers['Cache-Control'], 'no-store')
  assert.equal(state.params.get('companyId'), COMPANY_A)

  state.summaryError = new MockDashboardQueryError(400, 'VALIDATION_ERROR', 'Invalid date range', 'startDate')
  const invalid = await route.GET(new Request('http://local/api/dashboard/summary'))
  assert.equal(invalid.status, 400)
  assert.deepEqual(JSON.parse(JSON.stringify(invalid.body.error)), { code: 'VALIDATION_ERROR', message: 'Invalid date range', field: 'startDate' })

  state.summaryError = new Error('private database connection detail')
  const dependencyError = await route.GET(new Request('http://local/api/dashboard/summary'))
  assert.equal(dependencyError.status, 500)
  assert.deepEqual(JSON.parse(JSON.stringify(dependencyError.body.error)), { code: 'INTERNAL_ERROR', message: 'ไม่สามารถอ่านข้อมูล Dashboard ได้' })
  assert.equal(JSON.stringify(dependencyError.body).includes('private database connection detail'), false)

  state.ownerError = new Error('unauthenticated')
  state.summaryError = null
  const unauthenticated = await route.GET(new Request('http://local/api/dashboard/summary'))
  assert.equal(unauthenticated.status, 401)
  assert.equal(unauthenticated.body.error.code, 'OWNER_UNAUTHENTICATED')
})
