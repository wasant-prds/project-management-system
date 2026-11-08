import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { moduleLoader } from '../support/module-loader.mjs'
const loadTs = (path, mocks = {}, globals = {}) => moduleLoader(mocks, globals)(path.replace(/^\.\.\/\.\.\//, ''))
const sourceLinks = loadTs('../../lib/analysis-links.ts')

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
  assert.match(page, /<PageState kind="error" visual=\{loadFailureVisual\(loadError\)\} title="โหลด Analysis ไม่สำเร็จ"/)
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
