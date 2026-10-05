import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { createComponentLoader, descendants, React, Link, renderToStaticMarkup } from './component-runtime.mjs'
import { previewData } from './preview-fixtures.mjs'
import { checkBundleBudget } from '../../scripts/frontend-performance-budget.mjs'

const load = createComponentLoader({ 'next/link': { default: Link } })
const { paginateRows } = load('lib/client-pagination.ts')
const { generateAnalysisCsv } = load('lib/analysis-export.ts')
const renderTree = (Component, props) => {
  let tree
  renderToStaticMarkup(React.createElement(() => { tree = Component(props); return tree }))
  return tree
}

test('TC-30-01 pagination bounds initial DOM work to 50 of 10001 records without mutating sources', () => {
  const rows = Object.freeze(Array.from({ length: 10001 }, (_, id) => ({ id })))
  const result = paginateRows(rows, 0)
  assert.equal(result.rows.length, 50)
  assert.equal(result.total, 10001)
  assert.equal(result.pageCount, 201)
  assert.equal(result.rows[0], rows[0])
  assert.equal(rows.length, 10001)
})

test('TC-30-02 pagination exposes every record once including the incomplete final page', () => {
  const rows = Array.from({ length: 123 }, (_, id) => id)
  const pages = [0, 1, 2].map((page) => paginateRows(rows, page))
  assert.deepEqual(pages.flatMap((page) => [...page.rows]), rows)
  assert.equal(pages[2].start, 100)
  assert.equal(pages[2].rows.length, 23)
})

test('TC-30-03 empty small and out-of-range pagination produces valid boundaries', () => {
  assert.equal(paginateRows([], 99).page, 0)
  assert.equal(paginateRows([], 0).pageCount, 1)
  for (const page of [-10, NaN, Infinity]) assert.equal(paginateRows([1, 2], page).page, 0)
  assert.equal(paginateRows(Array(51).fill(1), 999).page, 1)
  assert.equal(paginateRows(Array(101).fill(1), 1.9).page, 1)
  for (const size of [0, -1, 1.5, NaN]) assert.throws(() => paginateRows([], 0, size), /Invalid page size/)
})

test('TC-30-04 a refreshed report resets pagination even when its row count is unchanged', () => {
  let state
  const hookLoad = createComponentLoader({ react: { ...React, useState(initial) {
    state ??= initial
    return [state, (value) => { state = value }]
  } } })
  const { useReportPage } = hookLoad('components/ui/report-pagination.tsx')
  const oldRows = Array.from({ length: 101 }, (_, id) => id)
  useReportPage(oldRows).onPageChange(2)
  assert.equal(useReportPage(oldRows).page, 2)
  const newRows = oldRows.map((value) => value + 1000)
  const page = useReportPage(newRows)
  assert.equal(page.page, 0)
  assert.equal(page.rows[0], 1000)
})

test('TC-30-05 pagination controls announce range and disable boundary actions', () => {
  const { ReportPagination } = load('components/ui/report-pagination.tsx')
  const { Button } = load('components/ui/button.tsx')
  const calls = []
  const tree = ReportPagination({ ...paginateRows(Array(51).fill('row'), 0), onPageChange: (page) => calls.push(page) })
  const buttons = descendants(tree).filter((node) => node.type === Button)
  assert.equal(buttons[0].props.disabled, true)
  assert.equal(buttons[1].props.disabled, false)
  buttons[1].props.onClick()
  assert.deepEqual(calls, [1])
  const html = renderToStaticMarkup(tree)
  assert.match(html, /aria-live="polite"/)
  assert.match(html, /1–50 จาก 51/)
  const last = ReportPagination({ ...paginateRows(Array(51).fill('row'), 1), onPageChange() {} })
  assert.equal(descendants(last).filter((node) => node.type === Button)[1].props.disabled, true)
  assert.equal(ReportPagination({ ...paginateRows([1], 0), onPageChange() {} }), null)
})

test('TC-30-06 each report table renders at most 50 rows while CSV retains all filtered records and exact Decimal hours', () => {
  const report = structuredClone(previewData().analysis)
  report.workItems = Array.from({ length: 123 }, (_, index) => ({ ...report.workItems[0], id: `work-${index}`, title: `Title-${index}` }))
  report.timeEntries = Array.from({ length: 123 }, (_, index) => ({ ...report.timeEntries[0], id: `time-${index}`, hours: '0.123456789012345678901234567890' }))
  report.loggedHoursByPeriod = Array.from({ length: 123 }, (_, index) => ({ ...report.loggedHoursByPeriod[0], startDate: `period-${index}` }))
  const tables = load('components/page/analysis/report-tables.tsx')
  for (const name of ['WorkItemsTable', 'DailyWorkTable', 'HoursPeriodTable']) {
    const html = renderToStaticMarkup(React.createElement(tables[name], { report }))
    assert.equal((html.match(/<tr\b/g) ?? []).length, 51, name)
    assert.match(html, /1–50 จาก 123/, name)
  }
  const csv = generateAnalysisCsv(report)
  assert.ok(csv.includes('Title-122'))
  assert.ok(csv.includes('time-122'))
  assert.ok(csv.includes('0.123456789012345678901234567890'))
})

function collectionSystem(fetch) {
  return createComponentLoader({}, { window: { location: { origin: 'http://unit.test' } }, fetch })('lib/fetch-collection.ts')
}
const response = (items, nextCursor = null, key = 'projects') => ({ ok: true, async json() { return { [key]: items, page: { nextCursor } } } })

test('TC-30-07 concurrent equivalent collections share one complete paginated request chain and skip persistent cache', async () => {
  let release
  const calls = []
  const { fetchCollection } = collectionSystem(async (url, options) => {
    calls.push({ url: new URL(url), options })
    if (calls.length === 1) await new Promise((resolve) => { release = resolve })
    return response([calls.length], calls.length === 1 ? 'page-2' : null)
  })
  const first = fetchCollection('/api/projects?companyId=one&status=open', 'projects')
  const second = fetchCollection('/api/projects?status=open&companyId=one', 'projects')
  assert.equal(first, second)
  release()
  assert.deepEqual(Array.from(await first), [1, 2])
  assert.equal(calls.length, 2)
  assert.equal(calls[1].url.searchParams.get('cursor'), 'page-2')
  assert.equal(calls[1].url.searchParams.get('companyId'), 'one')
  assert.equal(calls[0].options.cache, 'no-store')
  await fetchCollection('/api/projects?companyId=one&status=open', 'projects')
  assert.equal(calls.length, 3, 'a later read must fetch fresh data')
})

test('TC-30-08 different collection filters remain independent', async () => {
  let count = 0
  const { fetchCollection } = collectionSystem(async () => { count++; return response([]) })
  await Promise.all([fetchCollection('/api/projects?companyId=one', 'projects'), fetchCollection('/api/projects?companyId=two', 'projects')])
  assert.equal(count, 2)
})

test('TC-30-09 API errors release shared pending state so a retry can succeed', async () => {
  let count = 0
  const { fetchCollection } = collectionSystem(async () => ++count === 1 ? { ok: false, json: async () => ({ error: { message: 'ไม่สามารถอ่านข้อมูลได้' } }) } : response(['fresh']))
  const results = await Promise.allSettled([fetchCollection('/api/projects', 'projects'), fetchCollection('/api/projects', 'projects')])
  assert.ok(results.every((result) => result.status === 'rejected' && result.reason.message === 'ไม่สามารถอ่านข้อมูลได้'))
  assert.deepEqual(Array.from(await fetchCollection('/api/projects', 'projects')), ['fresh'])
  assert.equal(count, 2)
})

test('TC-30-10 transport JSON malformed payload and repeated cursors fail without infinite reads', async () => {
  for (const fetch of [async () => { throw new Error('Offline') }, async () => ({ ok: true, json: async () => { throw new SyntaxError('Invalid JSON') } }), async () => ({ ok: true, json: async () => ({ projects: [], page: {} }) })]) {
    const { fetchCollection } = collectionSystem(fetch)
    await assert.rejects(fetchCollection('/api/projects', 'projects'))
    await assert.rejects(fetchCollection('/api/projects', 'projects'))
  }
  let count = 0
  const { fetchCollection } = collectionSystem(async () => { count++; return response([], 'repeat') })
  await assert.rejects(fetchCollection('/api/projects', 'projects'), /หน้าข้อมูลถัดไป/)
  assert.equal(count, 2)
})

test('TC-30-11 collection reader rejects external origins before requesting data', async () => {
  let count = 0
  const { fetchCollection } = collectionSystem(async () => { count++; return response([]) })
  await assert.rejects(fetchCollection('https://external.test/api/projects', 'projects'), /Invalid collection origin/)
  assert.equal(count, 0)
})

test('TC-30-12 deferred section activates only near viewport and cleans its observer on activation and unmount', () => {
  let callback, options, observed, disconnected = 0, activated = 0
  class Observer {
    constructor(cb, opts) { callback = cb; options = opts }
    observe(element) { observed = element }
    disconnect() { disconnected++ }
  }
  const { observeSection } = createComponentLoader({}, { IntersectionObserver: Observer })('components/ui/deferred-section.tsx')
  const element = {}
  const cleanup = observeSection(element, () => activated++)
  assert.equal(observed, element)
  assert.equal(options.rootMargin, '240px')
  callback([{ isIntersecting: false }]); assert.equal(activated, 0)
  callback([{ isIntersecting: true }]); assert.equal(activated, 1)
  assert.equal(disconnected, 1)
  cleanup(); assert.equal(disconnected, 2)
})

test('TC-30-13 missing IntersectionObserver uses immediate accessible section rendering', () => {
  let count = 0
  const { observeSection } = load('components/ui/deferred-section.tsx')
  const cleanup = observeSection({}, () => count++)
  assert.equal(count, 1)
  assert.doesNotThrow(cleanup)
})

test('TC-30-14 a failed heavy section shows recovery while keeping the error scoped to that section', () => {
  const { SectionErrorBoundary: Boundary } = load('components/ui/retryable-lazy.tsx')
  const { ChartLoadError } = load('components/layout/chart-load-error.tsx')
  const boundary = new Boundary({ children: 'loaded', fallback: React.createElement(ChartLoadError, { heightClass: 'h-[320px]', onRetry() {} }) })
  boundary.state = Boundary.getDerivedStateFromError(new Error('Chunk failed'))
  const html = renderToStaticMarkup(boundary.render())
  assert.match(html, /role="alert"/)
  assert.match(html, /ข้อมูลส่วนอื่นยังใช้งานได้/)
  assert.match(html, /ลองโหลดกราฟอีกครั้ง/)
  assert.match(html, /h-\[320px\]/)
  assert.doesNotMatch(html, /Chunk failed/)
})

test('TC-30-15 chart animation stays premium for small sets and is bounded for large sets or reduced motion', () => {
  let reduced = false
  const Bar = () => null
  const chartLoad = createComponentLoader({
    'next/link': { default: Link },
    recharts: Object.fromEntries(['Bar', 'BarChart', 'CartesianGrid', 'Tooltip', 'XAxis', 'YAxis'].map((name) => [name, name === 'Bar' ? Bar : () => null])),
    '@/components/ui/chart': { ChartContainer: () => null, ChartTooltipContent: () => null },
    '@/hooks/use-prefers-reduced-motion': { usePrefersReducedMotion: () => reduced },
  })
  const { DashboardCharts } = chartLoad('components/layout/dashboard-charts.tsx')
  for (const [count, preference, expected] of [[100, false, true], [101, false, false], [1, true, false]]) {
    reduced = preference
    const tree = renderTree(DashboardCharts, { data: Array.from({ length: count }, () => ({ date: '2026-10-04', hours: '1.25' })), filters: {} })
    assert.equal(descendants(tree).find((node) => node.type === Bar).props.isAnimationActive, expected)
  }
})

test('TC-30-16 performance events report numeric vitals without query strings or Project identity', () => {
  const events = []
  class Event { constructor(type, options) { this.type = type; this.detail = options.detail } }
  const { publishPerformanceMetric } = createComponentLoader({}, { window: { location: { pathname: '/projects/private-id', search: '?token=secret' }, dispatchEvent(event) { events.push(event) } }, CustomEvent: Event })('lib/performance-metrics.ts')
  publishPerformanceMetric({ name: 'INP', value: 135, rating: 'good', id: 'secret' })
  assert.equal(events.length, 1)
  assert.equal(events[0].type, 'pms:performance')
  assert.deepEqual(JSON.parse(JSON.stringify(events[0].detail)), { name: 'INP', value: 135, rating: 'good', route: '/projects/[id]' })
  publishPerformanceMetric({ name: 'unknown', value: 3, rating: 'good' })
  publishPerformanceMetric({ name: 'LCP', value: NaN, rating: 'poor' })
  assert.equal(events.length, 1)
})

test('TC-30-17 bundle gate fails missing or oversized routes and accepts production Docker build rows', () => {
  const log = '#16 66.13 ┌ ƒ / 5.19 kB 174 kB\n#16 66.13 └ ƒ /analysis 14.8 kB 190 kB'
  assert.ok(checkBundleBudget(log, { '/': 185, '/analysis': 195 }).every((row) => row.pass))
  assert.equal(checkBundleBudget(log, { '/': 170 })[0].pass, false)
  assert.equal(checkBundleBudget(log, { '/daily-work': 185 })[0].pass, false)
})

test('TC-30-18 heavy route chunks and telemetry are explicitly bounded without globally importing chart code', () => {
  const source = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8')
  assert.doesNotMatch(source('app/analysis/page.tsx'), /from 'recharts'/)
  assert.match(source('app/page.tsx'), /dashboard-charts-deferred/)
  assert.match(source('app/daily-work/page.tsx'), /DeferredWorkLogDialog as WorkLogDialog/)
  assert.doesNotMatch(source('app/daily-work/page.tsx'), /is(?:Details)?DialogOpen && <WorkLogDialog/)
  assert.match(source('app/daily-work/page.tsx'), /listController.current\?\.abort\(\)/)
  assert.match(source('app/analysis/page.tsx'), /loadedQuery.current !== requestQuery/)
  assert.match(source('app/layout.tsx'), /FRONTEND_PERFORMANCE_METRICS_ENABLED === 'true'/)
  assert.match(source('components/ui/chart.tsx'), /ResponsiveContainer debounce=\{80\}/)
})

function analysisHarness() {
  const states = [], refs = [], pending = []
  let stateIndex = 0, refIndex = 0, effect
  const fixtureLoad = createComponentLoader({ react: { ...React,
    useState(initial) { const index = stateIndex++; if (!(index in states)) states[index] = typeof initial === 'function' ? initial() : initial; return [states[index], (value) => { states[index] = typeof value === 'function' ? value(states[index]) : value }] },
    useRef(initial) { const index = refIndex++; refs[index] ??= { current: initial }; return refs[index] },
    useEffect(callback) { effect = callback }, useMemo: (callback) => callback(), useCallback: (callback) => callback,
  } }, { fetch: (url, options) => new Promise((resolve) => pending.push({ url, options, resolve })) })
  const Page = fixtureLoad('app/analysis/page.tsx').default
  const { AnalysisChartsDeferred } = fixtureLoad('components/page/analysis/analysis-charts-deferred.tsx')
  return { pending, render() { stateIndex = 0; refIndex = 0; return descendants(Page()) }, runEffect() { return effect() }, report(tree) { return tree.find((node) => node.type === AnalysisChartsDeferred)?.props.report } }
}
const flush = () => new Promise(setImmediate)

test('TC-30-19 same-filter refresh keeps usable report through failure and retries without substituting zero data', async () => {
  const harness = analysisHarness()
  harness.render(); harness.runEffect()
  const report = structuredClone(previewData().analysis)
  harness.pending[0].resolve({ ok: true, json: async () => report }); await flush()
  let tree = harness.render()
  assert.equal(harness.report(tree), report)
  tree.find((node) => node.type === 'form').props.onSubmit({ preventDefault() {} })
  harness.render(); harness.runEffect()
  assert.equal(harness.report(harness.render()), report)
  harness.pending[1].resolve({ ok: false, json: async () => ({ error: { message: 'Synthetic outage' } }) }); await flush()
  tree = harness.render()
  assert.equal(harness.report(tree), report)
  assert.ok(tree.some((node) => node.props.description === 'Synthetic outage'))
  const alert = tree.find((node) => node.props.description === 'Synthetic outage')
  alert.props.action.props.onClick()
  harness.render(); harness.runEffect()
  const refreshed = structuredClone(report)
  refreshed.summary.total = 99
  harness.pending[2].resolve({ ok: true, json: async () => refreshed }); await flush()
  assert.equal(harness.report(harness.render()), refreshed)
})

test('TC-30-20 superseded Analysis request aborts and cannot overwrite a newer report', async () => {
  const harness = analysisHarness()
  harness.render(); const cleanup = harness.runEffect()
  cleanup()
  assert.equal(harness.pending[0].options.signal.aborted, true)
  harness.render(); harness.runEffect()
  const fresh = structuredClone(previewData().analysis)
  fresh.summary.total = 77
  harness.pending[1].resolve({ ok: true, json: async () => fresh }); await flush()
  harness.pending[0].resolve({ ok: true, json: async () => previewData().analysis }); await flush()
  assert.equal(harness.report(harness.render()), fresh)
})

test('TC-30-21 chart fallbacks reserve exact plot heights and render real empty-state geometry', () => {
  const { DashboardChartsDeferred } = load('components/layout/dashboard-charts-deferred.tsx')
  const { AnalysisChartsDeferred } = load('components/page/analysis/analysis-charts-deferred.tsx')
  const dashboard = renderToStaticMarkup(React.createElement(DashboardChartsDeferred, { data: [{ date: '2026-10-04', hours: '1.25' }], filters: {} }))
  assert.match(dashboard, /h-\[260px\]/)
  assert.match(dashboard, /เปิด Daily Work/)
  const report = structuredClone(previewData().analysis)
  const analysis = renderToStaticMarkup(React.createElement(AnalysisChartsDeferred, { report }))
  assert.equal((analysis.match(/h-\[320px\]/g) ?? []).length, 2)
  assert.match(analysis, /ช่วงวันที่/)
  assert.match(analysis, /2026-10-01/)
  const empty = renderToStaticMarkup(React.createElement(AnalysisChartsDeferred, { report: previewData('empty').analysis }))
  assert.match(empty, /ไม่มี Work Item ให้แสดงในกราฟนี้/)
  assert.match(empty, /ไม่มี Daily Work ให้แสดงในกราฟนี้/)
  assert.doesNotMatch(empty, /h-\[54px\]/)
})

test('TC-30-22 measured Recharts wrapper is not constrained against its zero-width internal shim', () => {
  const css = readFileSync(new URL('../../app/globals.css', import.meta.url), 'utf8')
  const wrappers = [...css.matchAll(/([^{}]+recharts-wrapper[^{}]*)\{([^{}]*)\}/g)]
  assert.ok(wrappers.length)
  for (const [, , declarations] of wrappers) assert.doesNotMatch(declarations, /max-width:\s*100%/)
  assert.match(css, /\[data-slot='chart'\] \.recharts-responsive-container\s*\{[^}]*max-width:\s*100%/)
})

test('TC-30-23 calendar hydration and lazy placeholders reserve the measured 336px footprint', () => {
  const { CALENDAR_HEIGHT_CLASS } = load('components/ui/calendar-layout.ts')
  assert.equal(CALENDAR_HEIGHT_CLASS, 'h-[336px]')
  const { Calendar } = load('components/ui/calendar.tsx')
  const html = renderToStaticMarkup(React.createElement(Calendar))
  assert.match(html, /h-\[336px\]/)
  assert.match(html, /role="status"/)
  const widgets = readFileSync(new URL('../../components/page/daily-work/deferred-widgets.tsx', import.meta.url), 'utf8')
  assert.match(widgets, /loading=\{<Skeleton className=\{`\$\{CALENDAR_HEIGHT_CLASS\} w-full`\}/)
})

test('TC-30-24 fresh collection reads supersede pending reads without allowing old cleanup to evict the new chain', async () => {
  const requests = []
  const { fetchCollection } = collectionSystem(() => new Promise((resolve) => requests.push(resolve)))
  const old = fetchCollection('/api/company', 'companies')
  const fresh = fetchCollection('/api/company', 'companies', { fresh: true })
  assert.notEqual(old, fresh)
  assert.equal(requests.length, 2)
  requests[0](response(['old'], null, 'companies')); await old
  assert.equal(fetchCollection('/api/company', 'companies'), fresh, 'old finalizer must not remove the pending fresh request')
  requests[1](response(['new'], null, 'companies'))
  assert.deepEqual(Array.from(await fresh), ['new'])
  const later = fetchCollection('/api/company', 'companies')
  assert.equal(requests.length, 3)
  requests[2](response(['later'], null, 'companies')); await later
})

function collectionPageHarness(path) {
  const states = [], refs = [], requests = []
  let stateIndex = 0, refIndex = 0, effect
  const pageLoad = createComponentLoader({ react: { ...React,
    useState(initial) { const i = stateIndex++; if (!(i in states)) states[i] = typeof initial === 'function' ? initial() : initial; return [states[i], (v) => { states[i] = typeof v === 'function' ? v(states[i]) : v }] },
    useRef(initial) { const i = refIndex++; refs[i] ??= { current: initial }; return refs[i] },
    useEffect(callback) { effect = callback }, useCallback: (callback) => callback,
  } }, { window: { location: { origin: 'http://unit.test', search: '' } }, fetch: (url, options) => options?.method
    ? Promise.resolve({ ok: true, json: async () => ({}) })
    : new Promise((resolve) => requests.push({ url: String(url), resolve })) })
  const Page = pageLoad(path).default
  return { requests, load: pageLoad, render() { stateIndex = 0; refIndex = 0; return descendants(Page()) }, runEffect() { return effect() } }
}

async function assertMutationRefresh(path, key, cardPath, cardName, prop) {
  const harness = collectionPageHarness(path)
  harness.render(); harness.runEffect()
  const old = harness.requests.find((r) => r.url.includes(`/api/${key === 'companies' ? 'company' : key}`))
  if (key === 'projects') { harness.requests.find((r) => r.url.includes('/api/company')).resolve(response([], null, 'companies')); await flush() }
  const saving = harness.render().find((node) => node.type === 'form').props.onSubmit({ preventDefault() {} })
  await flush()
  const fresh = harness.requests.filter((r) => r.url === old.url).at(-1)
  assert.notEqual(fresh, old)
  const newRow = { id: 'fresh', name: 'Fresh record', status: 'Planning', company: null }
  fresh.resolve(response([newRow], null, key))
  if (key === 'projects') { harness.requests.filter((r) => r.url.includes('/api/company')).at(-1).resolve(response([], null, 'companies')) }
  await saving
  old.resolve(response([{ ...newRow, id: 'old', name: 'Stale record' }], null, key)); await flush()
  const Card = harness.load(cardPath)[cardName]
  const rows = harness.render().filter((node) => node.type === Card).map((node) => node.props[prop])
  assert.deepEqual(rows.map((row) => row.id), ['fresh'])
}

test('TC-30-25 companies mutation refresh wins even when the pre-mutation request completes last', () =>
  assertMutationRefresh('app/company/page.tsx', 'companies', 'components/page/company/company-card.tsx', 'CompanyCard', 'company'))

test('TC-30-26 projects mutation refresh wins even when the pre-mutation request completes last', () =>
  assertMutationRefresh('app/projects/page.tsx', 'projects', 'components/page/projects/portfolio-card.tsx', 'PortfolioCard', 'project'))

test('TC-30-27 retry resets a rejected lazy component and invokes its loader again without replacing adjacent content', async () => {
  let state, count = 0
  const retryLoad = createComponentLoader({ react: { ...React,
    useState(initial) { state ??= initial(); return [state, (next) => { state = typeof next === 'function' ? next(state) : next }] },
  } })
  const { RetryableLazy } = retryLoad('components/ui/retryable-lazy.tsx')
  const Loaded = () => null
  const props = { loader: async () => { if (++count === 1) throw new Error('Chunk failed'); return { default: Loaded } }, componentProps: { open: true }, loading: 'Loading', error: (retry) => React.createElement('button', { onClick: retry }, 'Retry') }
  const first = RetryableLazy(props)
  const firstLazy = first.props.children.props.children.type
  let pending
  try { firstLazy._init(firstLazy._payload) } catch (value) { pending = value }
  await assert.rejects(pending, /Chunk failed/)
  assert.throws(() => firstLazy._init(firstLazy._payload), /Chunk failed/)
  first.props.fallback.props.onClick()
  const second = RetryableLazy(props)
  assert.notEqual(second.key, first.key)
  const secondLazy = second.props.children.props.children.type
  assert.notEqual(secondLazy, firstLazy)
  try { secondLazy._init(secondLazy._payload) } catch (value) { pending = value }
  await pending
  assert.equal(secondLazy._init(secondLazy._payload), Loaded)
  assert.equal(count, 2)
})

test('TC-30-28 deferred dialog stays dormant before first open and retains its controlled instance after closing', () => {
  let opened
  const widgetLoad = createComponentLoader({ react: { ...React, useState(initial) { opened ??= initial; return [opened, (value) => { opened = value }] } } })
  const { DeferredWorkLogDialog } = widgetLoad('components/page/daily-work/deferred-widgets.tsx')
  const props = { open: false, mode: 'add', onOpenChange() {} }
  assert.equal(DeferredWorkLogDialog(props), null)
  const first = DeferredWorkLogDialog({ ...props, open: true })
  const closed = DeferredWorkLogDialog(props)
  assert.equal(first.type, closed.type)
  assert.equal(first.props.loader, closed.props.loader)
  assert.equal(closed.props.componentProps.open, false)
  assert.ok(closed.props.loading)
  assert.ok(closed.props.error(() => {}))
})

test('TC-30-29 Analysis keeps its exact hours table outside lazy plot boundaries through errors', () => {
  const { AnalysisChartsDeferred } = load('components/page/analysis/analysis-charts-deferred.tsx')
  const { HoursPeriodTable } = load('components/page/analysis/report-tables.tsx')
  const { RetryableLazy } = load('components/ui/retryable-lazy.tsx')
  const report = structuredClone(previewData().analysis)
  report.loggedHoursByPeriod[0].hours = '0.123456789012345678901234567890'
  const tree = AnalysisChartsDeferred({ report })
  assert.equal(descendants(tree).filter((node) => node.type === HoursPeriodTable).length, 1)
  const plots = descendants(tree).filter((node) => node.type === RetryableLazy)
  assert.equal(plots.length, 2)
  for (const plot of plots) {
    assert.equal(descendants(plot).some((node) => node.type === HoursPeriodTable), false)
    assert.match(renderToStaticMarkup(plot.props.error(() => {})), /h-\[320px\]/)
  }
  assert.match(renderToStaticMarkup(React.createElement(HoursPeriodTable, { report })), /0.123456789012345678901234567890/)
})
