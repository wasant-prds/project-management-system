import assert from 'node:assert/strict'
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import test from 'node:test'
import postcss from 'postcss'
import tailwind from '@tailwindcss/postcss'
import { createComponentLoader, descendants, textContent, Link, React, renderToStaticMarkup, root } from './component-runtime.mjs'
import { previewData, previewResponse } from './preview-fixtures.mjs'
import { checkWorkLogLayout } from './work-log-layout-check.mjs'

const load = createComponentLoader({ 'next/link': { default: Link } })
const render = (Component, props) => renderToStaticMarkup(React.createElement(Component, props))
function renderTree(Component, props) {
  let tree; renderToStaticMarkup(React.createElement(() => { tree = Component(props); return tree })); return tree
}
const longText = 'Identifier'.repeat(30)
const exactHours = '12345678901234567890123456789012345.123456789012345678901234567890'
const { SummaryStatCard } = load('components/layout/summary-stat-card.tsx')
const { CardHeader, CardTitle } = load('components/ui/card.tsx')
const { CompanyCard } = load('components/page/company/company-card.tsx')
const { StatsCard } = load('components/page/daily-work/stats-card.tsx')
const { Button } = load('components/ui/button.tsx')
const { WorkItemsTable, DailyWorkTable, HoursPeriodTable } = load('components/page/analysis/report-tables.tsx')
const { Table, TableCell } = load('components/ui/table.tsx')
const { ApplicationState } = load('components/layout/application-state.tsx')

test('TC-29-01 KPI labels reserve two lines so short and wrapped labels share the value baseline', () => {
  for (const label of ['Completed', 'Work Items ทั้งหมด']) {
    const header = descendants(SummaryStatCard({ label, value: 6 })).find((node) => node.type === CardHeader)
    const title = descendants(header).find((node) => node.type === CardTitle)
    assert.match(header.props.className, /min-h-10/)
    assert.match(title.props.className, /leading-5/)
    assert.equal(textContent(title), label)
  }
})

test('TC-29-02 Company long contact text keeps every field and edit identity within shrinking tracks', () => {
  const company = { ...previewData().companies[0], name: longText, displayName: null, phone: longText, address: longText, location: null }
  const html = render(CompanyCard, { company, onEdit() {}, onDelete() {} })
  assert.equal(html.split(longText).length - 1, 3)
  assert.match(html, /content-wrap min-w-0/)
  const calls = []
  const button = descendants(CompanyCard({ company, onEdit: (value) => calls.push(value), onDelete() {} })).find((node) => node.type === Button && textContent(node) === 'แก้ไข')
  button.props.onClick()
  assert.equal(calls[0], company)
})

test('TC-29-03 Daily Work summary preserves large exact Decimal text beside its fixed label', () => {
  const tree = StatsCard({ totalHours: exactHours, totalLogs: 1 })
  const value = descendants(tree).find((node) => node.type === 'span' && node.props.children === exactHours)
  assert.match(value.props.className, /content-wrap min-w-0 text-right/)
  assert.ok(render(StatsCard, { totalHours: exactHours, totalLogs: 1 }).includes(exactHours))
})

test('TC-29-04 Input and Textarea retain invalid, disabled, label and change contracts after typography polish', () => {
  const { Input } = load('components/ui/input.tsx')
  const { Textarea } = load('components/ui/textarea.tsx')
  for (const Component of [Input, Textarea]) {
    const changes = []
    const node = Component({ id: 'notes', 'aria-describedby': 'notes-error', 'aria-invalid': true, disabled: true, value: longText, onChange: (event) => changes.push(event.target.value) })
    assert.equal(node.props.id, 'notes')
    assert.equal(node.props['aria-describedby'], 'notes-error')
    assert.equal(node.props['aria-invalid'], true)
    assert.equal(node.props.disabled, true)
    node.props.onChange({ target: { value: 'updated' } })
    assert.deepEqual(changes, ['updated'])
    assert.match(node.props.className, /text-base/)
    assert.match(node.props.className, /sm:text-sm/)
    assert.match(node.props.className, /min-w-0/)
  }
})

function primitive(tag) {
  function Primitive({ children, asChild, ...props }) {
    return asChild ? React.cloneElement(React.Children.only(children), props) : React.createElement(tag, props, children)
  }
  return Primitive
}
const dialogLoad = createComponentLoader({ '@radix-ui/react-dialog': { Portal: ({ children }) => children, Overlay: primitive('div'), Content: primitive('div'), Close: primitive('button'), Title: primitive('h2') } })
const { DialogContent, DialogHeader, DialogTitle } = dialogLoad('components/ui/dialog.tsx')

test('TC-29-05 modal long title reserves close-button space and comfortable multi-line leading', () => {
  const header = DialogHeader({ children: React.createElement(DialogTitle, null, longText) })
  assert.match(header.props.className, /pr-10/)
  const html = renderToStaticMarkup(header)
  assert.match(html, /type-page-title content-wrap/)
  assert.doesNotMatch(html, /text-lg/)
  assert.ok(html.includes(longText))
})

test('TC-29-06 shared modal close control remains optional and has a Thai accessible name', () => {
  const html = render(DialogContent, { children: 'รายละเอียด' })
  assert.match(html, /data-slot="dialog-close"/)
  assert.match(html, /size-8 items-center justify-center/)
  assert.match(html, /sr-only">ปิด/)
  assert.doesNotMatch(render(DialogContent, { showCloseButton: false, children: 'รายละเอียด' }), /data-slot="dialog-close"/)
})

test('TC-29-07 route error retry invokes the supplied reset once and conceals diagnostics', () => {
  const ErrorPage = load('app/error.tsx').default
  const calls = []
  const tree = ErrorPage({ error: new Error('private diagnostics'), reset: () => calls.push('retry') })
  const html = renderToStaticMarkup(tree)
  assert.match(html, /role="alert"/)
  assert.doesNotMatch(html, /private diagnostics|stack|digest/)
  const action = ApplicationState(tree.props).props.children.props.children.props.action
  descendants(action).find((node) => node.type === Button && textContent(node) === 'ลองอีกครั้ง').props.onClick()
  assert.deepEqual(calls, ['retry'])
})

test('TC-29-08 unknown route displays a themed recovery link without a fake retry or data fetch', () => {
  const NotFound = load('app/not-found.tsx').default
  const html = render(NotFound)
  assert.match(html, /ไม่พบหน้าที่ต้องการ/)
  assert.match(html, /href="\/"/)
  assert.match(html, /bg-background/)
  assert.doesNotMatch(html, /ลองอีกครั้ง|aria-busy="true"/)
})

test('TC-29-09 error and empty feedback retain unbroken titles and messages without clipping', () => {
  const { PageState } = load('components/layout/page-state.tsx')
  for (const kind of ['empty', 'error']) {
    const html = render(PageState, { kind, title: longText, description: longText })
    assert.equal(html.split(longText).length - 1, 2)
    assert.match(html, /content-wrap max-w-full/)
    assert.match(html, /content-wrap max-w-md/)
    assert.match(html, new RegExp(`role="${kind === 'error' ? 'alert' : 'status'}"`))
  }
})

function filteredReport() {
  const report = previewData().analysis
  report.meta.filters = { companyId: 'company-preview', projectId: 'project-0', role: 'Developer', kind: 'Task' }
  return report
}

test('TC-29-10 polished Work Item table retains source identity, filters and Bangkok reference date', () => {
  const report = filteredReport()
  report.workItems = [report.workItems[0]]
  report.workItems[0].title = longText
  const tree = renderTree(WorkItemsTable, { report })
  assert.equal(descendants(tree).some((node) => node.type === Table), true)
  const link = descendants(tree).find((node) => node.type === Link)
  const params = new URL(link.props.href, 'https://unit.test').searchParams
  for (const [key, value] of Object.entries({ ...report.meta.filters, ...report.meta.period, workItemId: report.workItems[0].id })) assert.equal(params.get(key), value)
  const html = renderToStaticMarkup(tree)
  assert.ok(html.includes(longText))
  assert.match(html, /วันที่อ้างอิง 2026-10-03/)
  assert.match(html, /data-slot="table-container"/)
})

test('TC-29-11 polished Daily Work numeric cell wraps without rounding exact Decimal hours', () => {
  const report = filteredReport()
  report.timeEntries = [{ ...report.timeEntries[0], hours: exactHours, description: longText, id: longText }]
  const tree = renderTree(DailyWorkTable, { report })
  assert.match(descendants(tree).find((node) => node.type === Table).props.className, /\[&_td\]:align-top/)
  const numeric = descendants(tree).find((node) => node.type === TableCell && node.props.children === exactHours)
  assert.match(numeric.props.className, /content-wrap text-right font-medium tabular-nums/)
  const html = renderToStaticMarkup(tree)
  assert.ok(html.includes(exactHours))
  assert.ok(html.includes(`TimeEntry ${longText}`))
  const params = new URL(descendants(tree).find((node) => node.type === Link).props.href, 'https://unit.test').searchParams
  assert.equal(params.get('startDate'), report.timeEntries[0].date)
  assert.equal(params.get('endDate'), report.timeEntries[0].date)
  assert.equal(params.get('projectId'), 'project-0')
})

test('TC-29-12 Daily Work missing optional relation and description show a clear fallback', () => {
  const report = filteredReport()
  report.timeEntries = [{ ...report.timeEntries[0], description: '', remarks: null, workItem: null }]
  const html = render(DailyWorkTable, { report })
  assert.match(html, /ไม่มีรายละเอียด/)
  assert.doesNotMatch(html, /undefined|null/)
  assert.match(html, /2026-10-03/)
})

test('TC-29-13 period table keeps exact hours and the same inclusive source interval', () => {
  const report = filteredReport()
  report.loggedHoursByPeriod = [{ startDate: '2026-10-01', endDate: '2026-10-31', hours: exactHours }]
  const tree = renderTree(HoursPeriodTable, { report })
  const link = descendants(tree).find((node) => node.type === Link)
  const params = new URL(link.props.href, 'https://unit.test').searchParams
  assert.equal(params.get('startDate'), '2026-10-01')
  assert.equal(params.get('endDate'), '2026-10-31')
  assert.ok(renderToStaticMarkup(tree).includes(exactHours))
})

test('TC-29-14 empty report tables describe missing sources without fabricated rows', () => {
  const report = previewData('empty').analysis
  assert.match(render(WorkItemsTable, { report }), /ไม่พบ Work Item/)
  assert.match(render(DailyWorkTable, { report }), /ไม่พบ Daily Work/)
  assert.equal(renderTree(HoursPeriodTable, { report }), null)
  assert.doesNotMatch(render(WorkItemsTable, { report }), /<tr|<table/)
})

test('TC-29-15 compiled polish CSS breaks unbroken content and enlarges touch close controls only for coarse pointers', async () => {
  const compiled = await postcss([tailwind()]).process(readFileSync(`${root}/app/globals.css`, 'utf8'), { from: `${root}/app/globals.css` })
  const css = postcss.parse(compiled.css)
  let wraps = false; let touchTarget = false
  css.walkRules((rule) => {
    if (rule.selector === '.content-wrap') rule.walkDecls('overflow-wrap', (decl) => { wraps = decl.value === 'anywhere' })
    if (rule.selector === "[data-slot='dialog-close']") {
      assert.equal(rule.parent.name, 'media')
      assert.match(rule.parent.params, /pointer: coarse/)
      const values = Object.fromEntries(rule.nodes.filter((node) => node.type === 'decl').map((node) => [node.prop, node.value]))
      touchTarget = values.width === '2.75rem' && values.height === '2.75rem'
    }
  })
  assert.equal(wraps, true)
  assert.equal(touchTarget, true)
})

test('TC-29-16 synthetic edge and empty fixtures are isolated and every preview write is rejected', () => {
  const original = previewData()
  const edge = previewData('edge')
  assert.ok(edge.companies[0].name.length > original.companies[0].name.length)
  assert.equal(edge.workLogs[0].hours, exactHours)
  assert.deepEqual(previewData(), original)
  const url = new URL('http://preview.test/api/work-items')
  assert.equal(previewResponse(url, 'GET', 'empty').value.workItems.length, 0)
  for (const method of ['POST', 'PATCH', 'DELETE']) assert.equal(previewResponse(url, method, 'edge').status, 405)
  assert.equal(previewResponse(new URL('http://preview.test/api/projects/missing')).status, 404)
})

test('TC-29-17 focused polish suite reuses the existing runner and remains in full frontend discovery', () => {
  const packageJson = JSON.parse(readFileSync(`${root}/package.json`, 'utf8'))
  assert.equal(packageJson.scripts['test:frontend-polish'], 'node tests/run.mjs frontend-polish')
  assert.match(readFileSync(`${root}/tests/run.mjs`, 'utf8'), /"frontend-polish":.*polish\.test\.mjs/)
})

test('TC-29-18 Daily Work card retains exact hours, long details and the selected record callback', () => {
  const { WorkLogCard } = createComponentLoader({ react: { ...React, useState: () => [true, () => {}] } })('components/page/daily-work/work-log-card.tsx')
  const workLog = { ...previewData().workLogs[0], hours: exactHours, description: longText, remarks: longText }
  const calls = []
  const tree = WorkLogCard({ workLog, onClick: (item) => calls.push(item) })
  const values = descendants(tree)
  const hours = values.find((node) => node.type === 'span' && textContent(node) === `${exactHours}h`)
  assert.match(hours.props.className, /content-wrap min-w-0/)
  for (const node of values.filter((node) => node.type === 'p' && textContent(node) === longText)) assert.match(node.props.className, /content-wrap/)
  assert.equal(values.filter((node) => node.type === 'p' && textContent(node) === longText).length, 2)
  const detail = values.find((node) => textContent(node) === 'ดูรายละเอียด' && typeof node.props.onClick === 'function')
  detail.props.onClick()
  assert.equal(calls[0], workLog)
})

test('TC-29-19 long Project page headings use the same responsive wrapping contract', () => {
  const { PAGE_HEADING } = load('components/layout/page-layout.ts')
  assert.match(PAGE_HEADING, /content-wrap min-w-0/)
  const html = renderToStaticMarkup(React.createElement('h1', { className: PAGE_HEADING }, longText))
  assert.ok(html.includes(longText))
})

test('TC-29-20 KPI loading and failure conceal stale counts while a successful empty result keeps zero', () => {
  const pending = render(SummaryStatCard, { label: 'Total', value: 987, isLoading: true })
  assert.match(pending, /data-slot="skeleton"/)
  assert.match(pending, /กำลังโหลดค่า/)
  assert.doesNotMatch(pending, /987/)
  const failed = render(SummaryStatCard, { label: 'Total', value: 987, unavailable: true })
  assert.match(failed, /aria-label="ไม่สามารถอ่านค่าได้">—/)
  assert.doesNotMatch(failed, /987|data-slot="skeleton"/)
  const empty = render(SummaryStatCard, { label: 'Total', value: 0 })
  assert.match(empty, />0</)
  assert.doesNotMatch(empty, /ไม่สามารถอ่านค่าได้|data-slot="skeleton"/)
})

test('TC-29-21 Daily Work empty search and empty day preserve the add action with distinct Thai guidance', () => {
  const listLoad = createComponentLoader({ react: { ...React, useState: (initial) => [initial, () => {}], useCallback: (callback) => callback, useMemo: (callback) => callback() } })
  const { WorkLogList } = listLoad('components/page/daily-work/work-log-list.tsx')
  const { PageState } = listLoad('components/layout/page-state.tsx')
  const calls = []
  for (const searchQuery of ['', 'missing']) {
    const tree = WorkLogList({ workLogs: [], searchQuery, onSearchChange() {}, onAddClick: () => calls.push('add') })
    const feedback = descendants(tree).find((node) => node.type === PageState)
    assert.ok(feedback)
    assert.equal(feedback.props.title, searchQuery ? 'ไม่พบ Daily Work ที่ตรงกับคำค้นหา' : 'ยังไม่มี Daily Work ในวันที่เลือก')
    feedback.props.action.props.onClick()
  }
  assert.deepEqual(calls, ['add', 'add'])
})

function dialogFocusFixture() {
  class Element {
    isConnected = true
    calls = []
    focus(options) { this.calls.push(options) }
  }
  const body = new Element()
  const document = { body, activeElement: new Element() }
  const ref = { current: null }
  const focusLoad = createComponentLoader({ react: { ...React, useRef: () => ref } }, { document, HTMLElement: Element })
  const { DialogContent } = focusLoad('components/ui/dialog.tsx')
  const content = (props = {}) => descendants(DialogContent(props)).find((node) => node.props['data-slot'] === 'dialog-content')
  const event = () => ({ defaultPrevented: false, preventDefault() { this.defaultPrevented = true } })
  return { document, content, event }
}

test('TC-29-22 controlled dialog without a Radix Trigger restores its opener without scrolling', () => {
  const ui = dialogFocusFixture()
  const content = ui.content()
  const opener = ui.document.activeElement
  content.props.onOpenAutoFocus(ui.event())
  ui.document.activeElement = ui.document.body
  const close = ui.event()
  content.props.onCloseAutoFocus(close)
  assert.equal(close.defaultPrevented, true)
  assert.equal(opener.calls.length, 1)
  assert.equal(opener.calls[0].preventScroll, true)
})

test('TC-29-23 dialog respects custom autofocus, detached openers and the normal body fallback', () => {
  const ui = dialogFocusFixture()
  let opened = 0
  const content = ui.content({ onOpenAutoFocus: () => { opened += 1 }, onCloseAutoFocus: (event) => event.preventDefault() })
  const opener = ui.document.activeElement
  content.props.onOpenAutoFocus(ui.event())
  content.props.onCloseAutoFocus(ui.event())
  assert.equal(opened, 1)
  assert.equal(opener.calls.length, 0)
  const normal = ui.content()
  normal.props.onOpenAutoFocus(ui.event())
  opener.isConnected = false
  const detached = ui.event()
  normal.props.onCloseAutoFocus(detached)
  assert.equal(detached.defaultPrevented, false)
  assert.equal(opener.calls.length, 0)
  ui.document.activeElement = ui.document.body
  normal.props.onOpenAutoFocus(ui.event())
  const fallback = ui.event()
  normal.props.onCloseAutoFocus(fallback)
  assert.equal(fallback.defaultPrevented, false)
  assert.equal(ui.document.body.calls.length, 0)
})

test('TC-29-24 browser geometry verdict rejects the reviewed zero-width Project regression and accepts readable cards', () => {
  const readable = { titleWidth: 616, titleHeight: 72, headerHeight: 152, cardWidth: 708, contentWidth: 708, hours: `${exactHours}h` }
  assert.equal(checkWorkLogLayout([readable], [exactHours]).status, 'pass')
  const reviewed = { ...readable, titleWidth: 0, titleHeight: 4464, headerHeight: 4512 }
  const result = checkWorkLogLayout([reviewed], [exactHours])
  assert.equal(result.status, 'fail')
  assert.ok(result.failures.includes('Card 1: Project identity collapsed'))
  const card = createComponentLoader({ react: { ...React, useState: () => [false, () => {}] } })('components/page/daily-work/work-log-card.tsx').WorkLogCard({ workLog: previewData('edge').workLogs[0], onClick() {} })
  const identity = descendants(card).find((node) => Object.hasOwn(node.props, 'data-work-log-identity'))
  assert.match(identity.props.className, /sm:basis-64/)
  assert.doesNotMatch(identity.props.className, /sm:basis-0/)
})

test('TC-29-25 layout audit waits for cards and catches local overflow or changed exact hours', () => {
  assert.equal(checkWorkLogLayout([], [exactHours]).status, 'pending')
  const result = checkWorkLogLayout([{ titleWidth: 200, titleHeight: 96, headerHeight: 192, cardWidth: 320, contentWidth: 380, hours: '123h' }], [exactHours])
  assert.equal(result.status, 'fail')
  assert.deepEqual(result.failures, ['Card 1: Horizontal overflow', 'Card 1: Exact hours changed'])
})

function prismaConfigFixture(loadEnvFile) {
  return createComponentLoader({ 'node:process': { loadEnvFile }, 'prisma/config': { defineConfig: (config) => config } })('prisma.config.ts').default
}

test('TC-29-26 Prisma CLI config preserves schema and seed command in local and tooling images without legacy warning config', () => {
  let loads = 0
  const config = prismaConfigFixture(() => { loads += 1 })
  assert.equal(loads, 1)
  assert.equal(config.schema, 'prisma/schema.prisma')
  assert.equal(config.migrations.seed, 'tsx prisma/seed.ts')
  assert.equal(Object.hasOwn(JSON.parse(readFileSync(`${root}/package.json`, 'utf8')), 'prisma'), false)
  const dockerfile = readFileSync(`${root}/Dockerfile`, 'utf8')
  for (const target of ['migrate', 'development']) {
    const stage = dockerfile.split(`FROM base AS ${target}`)[1].split(/\nFROM /)[0]
    assert.match(stage, /COPY prisma\.config\.ts \.\//)
  }
})

test('TC-29-27 Prisma config accepts an absent root env file but propagates read failures', () => {
  assert.equal(prismaConfigFixture(() => { throw { code: 'ENOENT' } }).migrations.seed, 'tsx prisma/seed.ts')
  const failure = Object.assign(new Error('synthetic read failure'), { code: 'EACCES' })
  assert.throws(() => prismaConfigFixture(() => { throw failure }), (error) => error === failure)
})

test('TC-29-28 native env loading keeps shell/container values and reads missing values from the root env', () => {
  const folder = mkdtempSync(join(tmpdir(), 'pms-issue29-env-'))
  assert.ok(resolve(folder).startsWith(resolve(tmpdir()) + '\\') || resolve(folder).startsWith(resolve(tmpdir()) + '/'))
  try {
    writeFileSync(join(folder, '.env'), 'PMS_TEST_EXISTING=file-value\nPMS_TEST_FROM_FILE=synthetic-file-value\n')
    const env = { ...process.env, PMS_TEST_EXISTING: 'shell-value' }
    delete env.PMS_TEST_FROM_FILE
    const result = spawnSync(process.execPath, ['--input-type=module', '-e', "import {loadEnvFile} from 'node:process'; loadEnvFile(); console.log(JSON.stringify([process.env.PMS_TEST_EXISTING,process.env.PMS_TEST_FROM_FILE]));"], { cwd: folder, env, encoding: 'utf8' })
    assert.equal(result.status, 0, result.stderr)
    assert.deepEqual(JSON.parse(result.stdout), ['shell-value', 'synthetic-file-value'])
  } finally {
    rmSync(folder, { recursive: true, force: true })
  }
})
