import assert from 'node:assert/strict'
import test from 'node:test'
import { createComponentLoader, descendants, React, renderToStaticMarkup, textContent } from './component-runtime.mjs'
import { previewData } from './preview-fixtures.mjs'

const load = createComponentLoader()
const { ReportContext } = load('components/page/analysis/report-context.tsx')
const { WorkMetricDefinitions } = load('components/layout/work-metric-definitions.tsx')

test('report context describes the returned applied period, named filters, units and completion rate', () => {
  const report = previewData().analysis
  const baseline = renderToStaticMarkup(React.createElement(ReportContext, { report }))
  for (const label of ['01/10/2026', '31/10/2026', 'Asia/Bangkok', 'ทุก Company', 'ทุก Project', 'ทุก role', 'ทุกชนิดงาน', 'หน่วย: รายการ · ชั่วโมง', '16.7%']) assert.ok(baseline.includes(label), label)
  report.meta.filters = { companyId: report.filterOptions.companies[0].id, projectId: report.filterOptions.projects[0].id, role: 'none', kind: 'Issue' }
  const active = renderToStaticMarkup(React.createElement(ReportContext, { report }))
  for (const label of ['Example Company', 'ปรับปรุงระบบจัดการงาน', 'ไม่ระบุ role', 'Issue']) assert.ok(active.includes(label), label)
  assert.doesNotMatch(active, /ทุก Company|ทุก Project|ทุกชนิดงาน/)
  report.meta.filters.role = 'infra'
  assert.match(renderToStaticMarkup(React.createElement(ReportContext, { report })), /Infrastructure/)
})

test('metric definitions are a closed native disclosure with readable formulas and precision rules', () => {
  const tree = WorkMetricDefinitions()
  assert.equal(tree.type, 'details')
  assert.equal(tree.props.open, undefined)
  assert.equal(descendants(tree).filter((node) => node.type === 'summary').length, 1)
  const text = textContent(tree)
  for (const definition of ['completed ÷ (total − cancelled) × 100', 'แสดง 0%', 'ไม่ปัดก่อนรวม', 'ทศนิยม 2 ตำแหน่ง', 'Asia/Bangkok', 'ไม่ใช่จำนวนงานที่เสร็จย้อนหลัง']) assert.ok(text.includes(definition), definition)
})

test('Dashboard reads both risk queues before recent work and retains filtered source conditions', async () => {
  const data = previewData().dashboard
  data.meta.filters = { companyId: '10000000-0000-4000-8000-000000000001', projectId: '10000000-0000-4000-8000-000000000002', role: 'Developer', kind: 'Task' }
  const local = createComponentLoader({
    '@/lib/owner': { getOwner: async () => ({ internalId: 1n }), ownerErrorMessage: () => null },
    '@/lib/dashboard': { getDashboardSummary: async () => data, DashboardQueryError: class extends Error {} },
  })
  const Page = local('app/page.tsx').default
  const content = Page({}).props.children
  const tree = await content.type(content.props)
  const nodes = descendants(tree)
  const lists = nodes.filter((node) => ['Work Items เร่งด่วน', 'Work Items เกินกำหนด', 'Work Items ล่าสุด'].includes(node.props.title))
  assert.deepEqual(lists.map((node) => node.props.title), ['Work Items เร่งด่วน', 'Work Items เกินกำหนด', 'Work Items ล่าสุด'])
  for (const list of lists) {
    const params = new URL(list.props.href, 'https://unit.test').searchParams
    for (const [key, value] of Object.entries({ ...data.meta.period, ...data.meta.filters })) assert.equal(params.get(key), value)
  }
  assert.equal(new URL(lists[0].props.href, 'https://unit.test').searchParams.get('openOnly'), 'true')
  assert.equal(new URL(lists[0].props.href, 'https://unit.test').searchParams.get('priority'), 'urgent')
  assert.equal(new URL(lists[1].props.href, 'https://unit.test').searchParams.get('overdue'), 'true')
  assert.equal(lists[0].props.items, data.summary.urgentWorkItems)
  assert.equal(lists[1].props.items, data.summary.overdueWorkItems)
  for (const list of lists) {
    const empty = list.type({ ...list.props, items: [] })
    assert.ok(descendants(empty).some((node) => node.props.title === `ไม่มี ${list.props.title} ในตัวกรองนี้`))
  }
})

test('hours source table remains available through an inline disclosure, including empty reports', () => {
  const local = createComponentLoader({
    '@/components/ui/deferred-section': { DeferredSection: () => null },
    '@/components/ui/retryable-lazy': { RetryableLazy: () => null },
    '@/components/page/analysis/report-tables': { HoursPeriodTable: () => null },
  })
  const { AnalysisChartsDeferred } = local('components/page/analysis/analysis-charts-deferred.tsx')
  const report = previewData().analysis
  const tree = AnalysisChartsDeferred({ report })
  const details = descendants(tree).find((node) => node.type === 'details')
  assert.ok(details)
  assert.equal(details.props.open, undefined)
  assert.ok(textContent(details).includes('3 ช่วง'))
  assert.match(renderToStaticMarkup(tree), /ชั่วโมงที่บันทึกรายวัน/)
  report.meta.loggedHoursGrouping = 'week'
  assert.match(renderToStaticMarkup(AnalysisChartsDeferred({ report })), /รายสัปดาห์/)
  report.meta.loggedHoursGrouping = 'month'
  assert.match(renderToStaticMarkup(AnalysisChartsDeferred({ report })), /รายเดือน/)
  const empty = previewData('empty').analysis
  assert.equal(descendants(AnalysisChartsDeferred({ report: empty })).some((node) => node.type === 'details'), false)
  assert.match(renderToStaticMarkup(AnalysisChartsDeferred({ report: empty })), /ไม่มี Daily Work ให้แสดงในกราฟนี้/)
})
