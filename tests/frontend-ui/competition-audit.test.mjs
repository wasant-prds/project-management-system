import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import test from 'node:test'
import { createComponentLoader, React, renderToStaticMarkup } from './component-runtime.mjs'
import { previewData } from './preview-fixtures.mjs'

const source = (path) => readFileSync(new URL(path, import.meta.url), 'utf8')
const packageJson = JSON.parse(source('../../package.json'))
const runner = source('../../tests/run.mjs')
const testingGuide = source('../../document/process/testing.md')
const load = createComponentLoader()

const showcaseSources = [
  '../../app/page.tsx',
  '../../app/board/page.tsx',
  '../../components/layout/dashboard-charts-deferred.tsx',
  '../../components/page/analysis/analysis-charts-deferred.tsx',
  '../../components/page/analysis/report-tables.tsx',
]

test('TC-36-01 compact empty and error states use the identity mark without a dashed frame or entrance motion', () => {
  const { InlineState } = load('components/layout/page-state.tsx')
  const empty = renderToStaticMarkup(React.createElement(InlineState, {
    visual: 'chart',
    title: 'ไม่มี Daily Work ในช่วงนี้',
    description: 'กราฟจะแสดงเมื่อมี TimeEntry ในช่วงที่เลือก',
  }))
  assert.match(empty, /data-slot="inline-state"/)
  assert.match(empty, /data-visual="chart"/)
  assert.match(empty, /data-slot="identity-mark"/)
  assert.doesNotMatch(empty, /role=/)
  assert.match(empty, /ไม่มี Daily Work ในช่วงนี้/)
  assert.match(empty, /stroke-width="1.75"/)
  assert.doesNotMatch(empty, /border-dashed|motion-content-enter|backdrop-blur/)
  const announced = renderToStaticMarkup(React.createElement(InlineState, { live: true, title: 'ไม่มีรายการเดียว' }))
  assert.match(announced, /role="status"/)
  const error = renderToStaticMarkup(React.createElement(InlineState, {
    kind: 'error',
    visual: 'network',
    title: 'โหลดตัวกรองไม่สำเร็จ',
    description: 'Failed to fetch',
  }))
  assert.match(error, /role="alert"/)
  assert.doesNotMatch(error, /role="status"/)
  assert.match(error, /data-visual="network"/)
  assert.match(error, /data-tone="danger"/)
  assert.match(error, /text-danger/)
})

test('TC-36-02 Dashboard keeps live empty copy, shell error, inset dates and status glyphs', () => {
  const page = source('../../app/page.tsx')
  assert.match(page, /ไม่มี Work Item ในตัวกรองนี้/)
  assert.match(page, /ไม่มี Project ในตัวกรองนี้/)
  assert.match(page, /ไม่พบ Work Items, Daily Work หรือ Projects ในช่วงและตัวกรองนี้/)
  assert.match(page, /ไม่สามารถเชื่อมต่อเพื่ออ่านข้อมูลจริงได้/)
  assert.match(page, /<InlineState/)
  assert.match(page, /function DashboardError[\s\S]*<PageState kind="error"/)
  assert.match(page, /PAGE_MAIN/)
  assert.match(page, /<DatePicker id="dashboard-start-date"/)
  assert.match(page, /<DatePicker id="dashboard-end-date"/)
  assert.match(page, /name="startDate"/)
  assert.match(page, /name="endDate"/)
  assert.match(page, /<WorkItemStatusBadge status=\{item\.status\} \/>/)
  assert.match(page, /strokeWidth=\{ICON_STROKE\}/)
  assert.doesNotMatch(page, /border-dashed|type="date"|<input id="dashboard-start-date"/)
  const charts = source('../../components/layout/dashboard-charts-deferred.tsx')
  assert.match(charts, /title="ไม่มี Daily Work ในช่วงนี้"/)
  assert.match(charts, /<InlineState/)
  assert.doesNotMatch(charts, /border-dashed/)
})

test('TC-36-03 Analysis empty frames and table status use the shared identity language', () => {
  const { AnalysisChartsDeferred } = load('components/page/analysis/analysis-charts-deferred.tsx')
  const empty = renderToStaticMarkup(React.createElement(AnalysisChartsDeferred, { report: previewData('empty').analysis }))
  assert.match(empty, /ไม่มี Work Item ให้แสดงในกราฟนี้/)
  assert.match(empty, /ไม่มี Daily Work ให้แสดงในกราฟนี้/)
  assert.match(empty, /data-slot="inline-state"/)
  assert.match(empty, /data-visual="chart"/)
  assert.doesNotMatch(empty, /border-dashed/)
  const { WorkItemsTable } = load('components/page/analysis/report-tables.tsx')
  const report = previewData().analysis
  report.workItems = [{ ...report.workItems[0], status: 'blocked' }]
  const table = renderToStaticMarkup(React.createElement(WorkItemsTable, { report }))
  assert.match(table, /data-slot="status-glyph"/)
  assert.match(table, /data-status="error"/)
  assert.match(table, />Blocked</)
  const cleared = previewData('empty').analysis
  const missing = renderToStaticMarkup(React.createElement(WorkItemsTable, { report: cleared }))
  assert.match(missing, /ไม่พบ Work Item ในช่วงและตัวกรองนี้/)
  assert.match(missing, /data-visual="search"/)
  assert.doesNotMatch(missing, /<table|border-dashed/)
})

test('TC-36-04 Board empty, filter failure and card status stay inside the current identity system', () => {
  const page = source('../../app/board/page.tsx')
  assert.match(page, /role="status" aria-busy="true"[^\n]*ContentLoadingSkeleton layout="board"/)
  assert.match(page, /<InlineState visual="records" title="ยังไม่มี Work Item ในสถานะนี้"/)
  assert.doesNotMatch(page, /<InlineState visual="records"[^>]*live/)
  assert.match(page, /<PageState kind="error" visual=\{loadFailureVisual\(boardError\)\} title="โหลด Board ไม่สำเร็จ"/)
  assert.match(page, /title="โหลดตัวกรองไม่สำเร็จ"/)
  assert.match(page, /ลองโหลดตัวกรองอีกครั้ง/)
  assert.match(page, /<WorkItemStatusBadge status=\{item\.status\} \/>/)
  assert.match(page, /<WorkItemStatusBadge status=\{status\} \/>/)
  assert.match(page, /strokeWidth=\{ICON_STROKE\}/)
  assert.match(page, /<span className="type-label">\{label\}<\/span>/)
  assert.doesNotMatch(page, /border-dashed|statusClass\(/)
  assert.match(page, /<main className="flex min-h-0 min-w-0 flex-1 overflow-hidden">/)
})

test('TC-36-05 Work Item sticky headers stay opaque without blur and subgroup labels use the type role', () => {
  const list = source('../../components/page/work-items/work-item-grouped-list.tsx')
  assert.match(list, /const STUCK_SURFACE = 'bg-card shadow-md'/)
  assert.match(list, /type-label flex h-8/)
  assert.match(list, /strokeWidth=\{ICON_STROKE\}/)
  assert.match(list, /visual="search"/)
  assert.doesNotMatch(list, /backdrop-blur|uppercase|tracking-\[0\.12em\]/)
})

test('TC-36-06 Company and Project create disclosures use the action icon and a visible focus ring', () => {
  const { DisclosureGlyph } = load('components/ui/product-icon.tsx')
  const glyph = renderToStaticMarkup(React.createElement(DisclosureGlyph))
  assert.match(glyph, /data-slot="disclosure-glyph"/)
  assert.match(glyph, /data-icon-category="action"/)
  assert.match(glyph, /stroke-width="1.75"/)
  assert.doesNotMatch(glyph, />\+</)
  for (const path of ['../../app/company/page.tsx', '../../app/projects/page.tsx']) {
    const page = source(path)
    assert.match(page, /<DisclosureGlyph \/>/)
    assert.match(page, /focus-visible:ring-2 focus-visible:ring-ring/)
    assert.doesNotMatch(page, /text-link">\+<\/span>|focus-visible:outline-2/)
  }
})

test('TC-36-07 Project detail status and functional role use shared labels instead of raw keys', () => {
  const page = source('../../app/projects/[id]/page.tsx')
  assert.match(page, /<WorkItemStatusBadge status=\{status\} \/>/)
  assert.match(page, /<WorkItemStatusBadge status=\{item\.status\} \/>/)
  assert.match(page, /workItemRoleLabel\(role\)/)
  assert.match(page, /workItemRoleLabel\(item\.role\)/)
  assert.match(page, /id="project-detail-heading"/)
  assert.match(page, /data-shared-id=\{id\}/)
  assert.doesNotMatch(page, /<Badge variant="outline">\{item\.status\}<\/Badge>|<span>\{status\}<\/span>/)
  const { workItemRoleLabel } = load('components/page/work-items/work-item-role-label.ts')
  assert.equal(workItemRoleLabel(null), 'ไม่ระบุ role')
  assert.equal(workItemRoleLabel('infra'), 'Infrastructure')
  assert.equal(workItemRoleLabel('custom-role'), 'custom-role')
  const { WorkItemStatusBadge } = load('components/page/work-items/work-item-status-badge.tsx')
  const unknown = renderToStaticMarkup(React.createElement(WorkItemStatusBadge, { status: 'legacy-status' }))
  assert.match(unknown, /data-status="info"/)
  assert.match(unknown, /legacy-status/)
  assert.match(unknown, /data-slot="status-glyph"/)
})

test('TC-36-08 Settings load failure uses the shared error state and keeps retry', () => {
  const page = source('../../app/settings/page.tsx')
  assert.match(page, /<PageState kind="error" visual=\{loadFailureVisual\(loadError\)\} title="โหลดการตั้งค่าไม่สำเร็จ" description=\{loadError\}/)
  assert.match(page, /ลองโหลดอีกครั้ง/)
  assert.match(page, /aria-busy=\{isLoading\}/)
  assert.doesNotMatch(page, /<p role="alert" className="text-sm text-danger">\{loadError\}<\/p>/)
})

test('TC-36-09 shell owner caption uses the caption role and icon stroke stays on the shared system', () => {
  const header = source('../../components/layout/app-header.tsx')
  assert.match(header, /<span className="type-caption block">เจ้าของระบบ<\/span>/)
  assert.match(header, /strokeWidth=\{1\.75\}/)
  assert.doesNotMatch(header, /text-\[11px\]/)
})

test('TC-36-10 competition audit has a reusable unit runner and no Makefile target', () => {
  assert.equal(packageJson.scripts['test:frontend-competition'], 'node tests/run.mjs frontend-competition')
  assert.match(runner, /"frontend-competition": \{ files: \[join\(testRoot, "frontend-ui", "competition-audit\.test\.mjs"\)\] \}/)
  assert.match(testingGuide, /pnpm test:frontend-competition[\s\S]*bash scripts\/test-unit\.sh frontend-competition/)
  assert.match(testingGuide, /ไม่มี Makefile target/)
  assert.equal(existsSync(new URL('../../Makefile', import.meta.url)), false)
  for (const path of showcaseSources) assert.doesNotMatch(source(path), /border-dashed/)
})

test('TC-36-11 blocked and unauthenticated gates stay on the existing owner response', () => {
  const identity = load('components/ui/product-identity.ts')
  assert.equal(identity.VISUAL_STATE_APPLICABILITY.permission, 'not-applicable')
  const gate = source('../../middleware.ts')
  assert.match(gate, /401/)
  assert.doesNotMatch(source('../../app/settings/page.tsx'), /permission matrix|ProjectMember/)
})
