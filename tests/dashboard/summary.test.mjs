import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { moduleLoader } from '../support/module-loader.mjs'
const loadTs = (path, mocks = {}, globals = {}) => moduleLoader(mocks, globals)(path.replace(/^\.\.\/\.\.\//, ''))
import { createRequire } from 'node:module'
import vm from 'node:vm'
const require = createRequire(import.meta.url)
const ts = require('typescript')
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
const dashboard = loadTs('../../lib/dashboard.ts')
const links = loadTs('../../lib/dashboard-links.ts')
const fixedNow = new Date('2026-10-02T04:00:00.000Z')

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
