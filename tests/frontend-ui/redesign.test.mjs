import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { createComponentLoader, descendants, textContent, Link, React, renderToStaticMarkup, require, root } from './component-runtime.mjs'

const load = createComponentLoader({ 'next/link': { default: Link } })
const { PortfolioCard } = load('components/page/projects/portfolio-card.tsx')
const { CompanyCard } = load('components/page/company/company-card.tsx')
const { PageState } = load('components/layout/page-state.tsx')
const { Button } = load('components/ui/button.tsx')
const { Input } = load('components/ui/input.tsx')
const { APP_NAVIGATION, isNavigationActive } = load('components/layout/navigation.ts')
const render = (Component, props) => renderToStaticMarkup(React.createElement(Component, props))
const project = { id: 'project-27', name: 'ระบบจัดการงาน', status: 'In Progress', priority: 'High', dueDate: '2026-10-31', company: { name: 'Example Company', displayName: 'Example' }, summary: { total: 27, completed: 13, open: 14, progress: 48.148, hours: '123.000000000000000000000000000001' } }
const company = { id: 'company-27', code: null, name: 'Example Company', displayName: 'Example', location: 'Bangkok', address: null, phone: null, description: null, summary: { projects: 2, workItems: 27, hours: '123.000000000000000000000000000001' } }

test('TC-27-01 navigation identifies only the current route and its nested detail', () => {
  for (const path of ['/', '/projects', '/projects/project-27', '/work-items', '/board', '/analysis', '/daily-work', '/company', '/settings']) {
    assert.equal(APP_NAVIGATION.filter((item) => isNavigationActive(path, item.url)).length, 1, path)
  }
  assert.equal(isNavigationActive('/projects-archive', '/projects'), false)
  assert.equal(isNavigationActive('/unknown', '/'), false)
})

function sidebarFixture(pathname) {
  const closed = []
  const primitive = ({ children, asChild, isActive, className, variant, ...props }) => asChild
    ? React.cloneElement(React.Children.only(children), { 'data-active': isActive, ...props })
    : React.createElement('div', { className }, children)
  const sidebar = Object.fromEntries(['Sidebar', 'SidebarContent', 'SidebarFooter', 'SidebarGroup', 'SidebarGroupContent', 'SidebarGroupLabel', 'SidebarHeader', 'SidebarMenu', 'SidebarMenuButton', 'SidebarMenuItem'].map((name) => [name, primitive]))
  sidebar.useSidebar = () => ({ setOpenMobile: (value) => closed.push(value) })
  const fixtureLoad = createComponentLoader({ 'next/link': { default: Link }, 'next/navigation': { usePathname: () => pathname }, '@/components/ui/sidebar': sidebar })
  return { component: fixtureLoad('components/layout/app-sidebar.tsx').AppSidebar.type, closed }
}

test('TC-27-02 sidebar renders all eight real destinations and announces the active Project detail', () => {
  const { component } = sidebarFixture('/projects/project-27')
  const html = render(component)
  for (const item of APP_NAVIGATION) assert.ok(html.includes(`href="${item.url}"`), item.url)
  assert.equal((html.match(/aria-current="page"/g) ?? []).length, 1)
  assert.match(html, /href="\/projects"[^>]*aria-current="page"/)
  assert.match(html, /aria-label="เมนูหลัก"/)
})

test('TC-27-03 selecting a navigation destination dismisses the mobile drawer', () => {
  const { component, closed } = sidebarFixture('/work-items')
  const element = descendants(component()).find((item) => item.type === Link && item.props.href === '/board')
  element.props.onClick()
  assert.deepEqual(closed, [false])
})

function headerFixture(settings, loadError = null) {
  const passthrough = ({ children }) => React.createElement(React.Fragment, null, children)
  const dropdown = Object.fromEntries(['DropdownMenu', 'DropdownMenuContent', 'DropdownMenuItem', 'DropdownMenuLabel', 'DropdownMenuSeparator', 'DropdownMenuTrigger'].map((name) => [name, passthrough]))
  return createComponentLoader({
    'next/link': { default: Link }, 'next/navigation': { usePathname: () => '/projects/project-27' },
    '@/components/layout/owner-settings-provider': { useOwnerSettings: () => ({ settings, isLoading: false, loadError }) },
    '@/components/ui/sidebar': { SidebarTrigger: () => React.createElement('button', null, 'เมนูหลัก') },
    '@/components/ui/theme-toggle': { ThemeToggle: () => null },
    '@/components/ui/dropdown-menu': dropdown,
  })('components/layout/app-header.tsx').AppHeader.type
}

test('TC-27-04 header reads the persisted owner and links breadcrumbs and profile actions to real routes', () => {
  const html = render(headerFixture({ profile: { name: 'เจ้าของที่บันทึกไว้' } }))
  assert.match(html, /เจ้าของที่บันทึกไว้/)
  assert.match(html, /aria-label="Breadcrumb"/)
  assert.match(html, /aria-current="page"[^>]*>รายละเอียด/)
  for (const href of ['/projects', '/work-items', '/settings']) assert.ok(html.includes(`href="${href}"`))
  assert.doesNotMatch(html, /New task assigned|E-Commerce Platform|Log out|type="search"/)
})

test('TC-27-05 unavailable owner settings display safe profile feedback without a fabricated identity', () => {
  const html = render(headerFixture(null, 'API unavailable'))
  assert.match(html, /โหลดโปรไฟล์ไม่สำเร็จ/)
  assert.match(html, /เจ้าของระบบ/)
  assert.doesNotMatch(html, /undefined|null|API unavailable/)
})

test('TC-27-06 loading feedback announces its busy state and uses reduced-motion-safe animation', () => {
  const html = render(PageState, { kind: 'loading', title: 'กำลังโหลด Projects…' })
  assert.match(html, /role="status" aria-busy="true"/)
  assert.match(html, /motion-safe:animate-spin/)
  assert.match(html, /กำลังโหลด Projects…/)
})

test('TC-27-07 empty feedback describes the next step and preserves its action', () => {
  const html = render(PageState, { title: 'ไม่พบ Project', description: 'ลองปรับตัวกรอง', action: React.createElement(Button, { type: 'button' }, 'คืนค่าเริ่มต้น') })
  assert.match(html, /role="status" aria-busy="false"/)
  assert.match(html, /ลองปรับตัวกรอง/)
  assert.match(html, /<button[^>]*type="button"[^>]*>คืนค่าเริ่มต้น/)
})

test('TC-27-08 errors remain visible alerts and never substitute fake aggregate values', () => {
  const html = render(PageState, { kind: 'error', title: 'โหลดไม่สำเร็จ', description: 'กรุณาลองใหม่' })
  assert.match(html, /role="alert"/)
  assert.match(html, /text-danger/)
  assert.match(html, /กรุณาลองใหม่/)
  assert.doesNotMatch(html, /0 ชั่วโมง|0 Work Items/)
})

test('TC-27-09 portfolio preserves Company, Bangkok calendar date, progress and exact Decimal hours', () => {
  const html = render(PortfolioCard, { project, onEdit() {} })
  for (const value of ['Example', '13/27', '14', '48.1%', '2026-10-31', project.summary.hours]) assert.ok(html.includes(value), value)
  assert.match(html, /href="\/projects\/project-27"/)
  assert.match(html, /aria-valuenow="48.148"/)
})

test('TC-27-10 portfolio handles missing Company and preserves the selected edit identity', () => {
  const calls = []
  const props = { project: { ...project, company: null }, onEdit: (id) => calls.push(id) }
  assert.match(render(PortfolioCard, props), /ยังไม่ผูก Company/)
  const edit = descendants(PortfolioCard(props)).find((item) => item.type === Button && textContent(item) === 'แก้ไข')
  edit.props.onClick()
  assert.deepEqual(calls, ['project-27'])
})

test('TC-27-11 Company card keeps real totals and its filtered Project drill-through', () => {
  const html = render(CompanyCard, { company, onEdit() {}, onDelete() {} })
  assert.match(html, /href="\/projects\?companyId=company-27"/)
  assert.ok(html.includes(company.summary.hours))
  assert.match(html, /Example Company/)
  assert.doesNotMatch(html, />ลบ<|members|Manage Team/)
})

test('TC-27-12 default Company and Companies with Projects never expose the delete action', () => {
  for (const item of [{ ...company, code: 'dhas', summary: { ...company.summary, projects: 0 } }, company]) {
    const html = render(CompanyCard, { company: item, onEdit() {}, onDelete() {} })
    assert.doesNotMatch(html, />ลบ<|onDelete/)
  }
})

test('TC-27-13 empty non-default Company exposes edit/delete callbacks with the unchanged record', () => {
  const item = { ...company, summary: { projects: 0, workItems: 0, hours: '0' } }
  const calls = []
  const tree = CompanyCard({ company: item, onEdit: (value) => calls.push(['edit', value]), onDelete: (value) => calls.push(['delete', value]) })
  for (const label of ['แก้ไข', 'ลบ']) descendants(tree).find((element) => element.type === Button && textContent(element) === label).props.onClick()
  assert.deepEqual(calls, [['edit', item], ['delete', item]])
  assert.match(render(CompanyCard, { company: item, onEdit() {}, onDelete() {} }), /ยังไม่มี Project/)
})

test('TC-27-14 redesigned controls preserve label, invalid, disabled and busy semantics', () => {
  const html = renderToStaticMarkup(React.createElement('form', null,
    React.createElement('label', { htmlFor: 'name' }, 'ชื่อ Project'),
    React.createElement(Input, { id: 'name', 'aria-invalid': true, 'aria-describedby': 'name-error', disabled: true, value: 'เดิม', readOnly: true }),
    React.createElement('p', { id: 'name-error', role: 'alert' }, 'ชื่อไม่ถูกต้อง'),
    React.createElement(Button, { disabled: true, 'aria-busy': true, type: 'submit' }, 'กำลังบันทึก…')))
  for (const value of ['for="name"', 'aria-invalid="true"', 'aria-describedby="name-error"', 'disabled=""', 'aria-busy="true"', 'type="submit"']) assert.ok(html.includes(value), value)
  assert.match(html, /focus-visible:ring-ring/)
})

test('TC-27-15 Table keeps semantic sorting and selection inside a local scroll container', () => {
  const { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } = load('components/ui/table.tsx')
  const html = renderToStaticMarkup(React.createElement(Table, null,
    React.createElement(TableHeader, null, React.createElement(TableRow, null, React.createElement(TableHead, { 'aria-sort': 'ascending' }, 'วันที่'))),
    React.createElement(TableBody, null, React.createElement(TableRow, { 'data-state': 'selected' }, React.createElement(TableCell, null, '2026-10-03')))))
  assert.match(html, /data-slot="table-container"[^>]*overflow-x-auto/)
  assert.match(html, /<th[^>]*aria-sort="ascending"/)
  assert.match(html, /<tr[^>]*data-state="selected"/)
  assert.match(html, /<td[^>]*>2026-10-03/)
})

test('TC-27-16 Calendar uses the selected day and emits the same picker date through its callback', () => {
  let calendarProps
  const calls = []
  const date = new Date(2026, 9, 3, 12)
  const fixtureLoad = createComponentLoader({
    react: { ...React, useState: () => [true, () => {}], useEffect() {} },
    '@mui/x-date-pickers/LocalizationProvider': { LocalizationProvider: ({ children }) => children },
    '@mui/x-date-pickers/DateCalendar': { DateCalendar: (props) => { calendarProps = props; return React.createElement('div', { 'data-calendar': true }) } },
  })
  const { Calendar } = fixtureLoad('components/ui/calendar.tsx')
  render(Calendar, { selectedDate: date, onDateChange: (value) => calls.push(value) })
  const { yearCalendarClasses } = require('@mui/x-date-pickers/YearCalendar')
  const { monthCalendarClasses } = require('@mui/x-date-pickers/MonthCalendar')
  const calendarViewSelector = `& .${yearCalendarClasses.button}, & .${monthCalendarClasses.button}`
  const calendarViewStyles = calendarProps.sx[calendarViewSelector]
  assert.equal(calendarProps.value.format('YYYY-MM-DD'), '2026-10-03')
  calendarProps.onChange(require('dayjs')(date))
  assert.equal(calls[0].getTime(), date.getTime())
  calendarProps.onChange(null)
  assert.equal(calls[1], null)
  assert.equal(calendarProps.sx['& .MuiPickersDay-root']['&.Mui-selected'].color, 'var(--primary-foreground)')
  assert.equal(calendarProps.sx['& .MuiPickersDay-root']['&.Mui-selected'].backgroundColor, 'var(--primary)')
  assert.ok(calendarViewStyles, 'calendar year and month selectors match the installed MUI utility classes')
  assert.equal(calendarViewStyles.fontFamily, 'inherit')
  assert.equal(calendarViewStyles['&.Mui-selected'].color, 'var(--primary-foreground)')
  assert.equal(calendarViewStyles['&.Mui-selected'].backgroundColor, 'var(--primary)')
  assert.equal(calendarProps.sx['& .MuiPickersYear-yearButton, & .MuiPickersMonth-monthButton'], undefined)
  render(Calendar, { selectedDate: undefined })
  assert.equal(calendarProps.value, null)
})

function luminance(hex) {
  const values = hex.match(/[a-f0-9]{2}/gi).map((value) => Number.parseInt(value, 16) / 255).map((value) => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4)
  return values[0] * 0.2126 + values[1] * 0.7152 + values[2] * 0.0722
}

test('TC-27-17 all themes meet WCAG AA normal-text contrast for surfaces, semantic text and solid buttons', () => {
  const css = require('postcss').parse(readFileSync(`${root}/app/globals.css`, 'utf8'))
  const base = new Map()
  for (const selector of [':root', '.dark', '.special-dark']) {
    const values = new Map(base)
    css.walkRules((rule) => {
      if (!rule.selectors.includes(selector)) return
      const declared = new Set()
      rule.walkDecls((decl) => {
        assert.equal(declared.has(decl.prop), false, `${selector}: duplicate ${decl.prop}`)
        declared.add(decl.prop)
        values.set(decl.prop, decl.value)
      })
    })
    if (selector === ':root') for (const [key, value] of values) base.set(key, value)
    const resolveToken = (name) => {
      const value = values.get(name)
      const ref = /^var\((--[\w-]+)\)$/.exec(value)
      return ref ? resolveToken(ref[1]) : value
    }
    const contrast = (foreground, background) => {
      const a = luminance(resolveToken(foreground)); const b = luminance(resolveToken(background))
      assert.ok((Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05) >= 4.5, `${selector}: ${foreground} on ${background}`)
    }
    for (const surface of ['--background', '--card', '--input', '--popover']) {
      for (const foreground of ['--foreground', '--muted-foreground', '--link', '--danger', '--success', '--warning', '--info']) contrast(foreground, surface)
    }
    contrast('--primary-foreground', '--primary')
    contrast('--destructive-foreground', '--destructive')
    contrast('--accent-foreground', '--accent')
  }
})

test('TC-27-18 Tailwind emits pressed/hover surfaces, tablet drawer and touch/reduced-motion rules', async () => {
  const css = readFileSync(`${root}/app/globals.css`, 'utf8')
  const result = await require('postcss')([require('@tailwindcss/postcss')()]).process(css, { from: `${root}/app/globals.css` })
  assert.match(result.css, /\.active\\:surface-pressed[\s\S]*?box-shadow:\s*var\(--surface-shadow-pressed\)/)
  assert.match(result.css, /\.active\\:surface-inset[\s\S]*?box-shadow:\s*var\(--surface-shadow-inset\)/)
  assert.match(result.css, /@media \(pointer:\s*coarse\)[\s\S]*?min-height:\s*2\.75rem/)
  assert.match(result.css, /prefers-reduced-motion:\s*reduce/)
  assert.match(result.css, /\.lg\\:flex[\s\S]*?width >= 64rem/)
})

test('TC-27-19 redesign suite is reusable through pnpm and the shared runner', () => {
  const packageJson = JSON.parse(readFileSync(`${root}/package.json`, 'utf8'))
  assert.equal(packageJson.scripts['test:frontend-redesign'], 'node tests/run.mjs frontend-redesign')
  assert.match(readFileSync(`${root}/tests/run.mjs`, 'utf8'), /"frontend-redesign":/)
})


test('TC-27-20 chart dot links have stable period keys, accessible names and unchanged source URLs', () => {
  const { renderHoursChartDot } = load('components/page/analysis/hours-chart-dot.tsx')
  const keys = []
  for (const date of ['2026-10-01', '2026-10-02']) {
    const href = `/daily-work?startDate=${date}&endDate=${date}`
    const element = renderHoursChartDot({ cx: 42, cy: 60, payload: { startDate: date, href, accessibleName: `Daily Work ${date}` } })
    keys.push(element.key)
    assert.equal(element.key, date)
    const html = renderToStaticMarkup(element)
    assert.ok(html.includes(href.replaceAll('&', '&amp;')))
    assert.match(html, /aria-label="Daily Work/)
    assert.match(html, /<circle[^>]*cx="42"[^>]*cy="60"[^>]*r="4"/)
  }
  assert.equal(new Set(keys).size, 2)
  assert.equal(renderToStaticMarkup(renderHoursChartDot({})), '<g></g>')
})

test('TC-27-21 GitLab PMS Project mapping renders the shared accessible themed Select', () => {
  const source = readFileSync(`${root}/components/page/work-items/gitlab-import-panel.tsx`, 'utf8')
  const selectSource = readFileSync(`${root}/components/ui/select.tsx`, 'utf8')
  const { GitLabImportPanel } = load('components/page/work-items/gitlab-import-panel.tsx')
  const html = render(GitLabImportPanel, {
    projects: [{ id: 'project-1', name: 'Project Alpha' }, { id: 'project-2', name: 'Project Beta' }],
    onSynced: async () => {},
  })

  assert.doesNotMatch(source, /<select\b|<option\b/)
  assert.match(html, /role="combobox"/)
  assert.match(html, /id="gitlab-pms-project"/)
  assert.match(html, /aria-labelledby="gitlab-pms-project-label"/)
  assert.match(html, /aria-required="true"/)
  assert.match(html, /เลือก Project/)
  assert.match(html, /surface-inset[^\"]*rounded-md[^\"]*border[^\"]*bg-input/)
  assert.match(selectSource, /bg-popover text-popover-foreground/)
  assert.match(selectSource, /focus:bg-accent focus:text-accent-foreground/)
  assert.match(selectSource, /max-h-\(--radix-select-content-available-height\)/)
})

test('TC-27-22 Board Work Item detail uses the same responsive width shell as Work Items dialogs', () => {
  const pass = (tag) => ({ children, ...props }) => React.createElement(tag, props, children)
  const mocks = {
    '@/components/ui/dialog': {
      Dialog: ({ children }) => React.createElement(React.Fragment, null, children),
      DialogContent: pass('section'), DialogDescription: pass('p'), DialogFooter: pass('footer'),
      DialogHeader: pass('header'), DialogTitle: pass('h2'),
    },
    '@/components/ui/button': { Button: pass('button') },
    '@/components/ui/badge': { Badge: pass('span') },
    '@/components/page/work-items/work-item-description': { WorkItemDescription: ({ text }) => React.createElement('p', null, text) },
    '@/components/page/work-items/work-item-presentation': { kindClass: () => '', priorityClass: () => '', statusClass: () => '' },
    '@/components/page/board/board-workflow': { formatBoardCalendarDate: (value) => value ?? '—' },
  }
  const dialogLoad = createComponentLoader(mocks)
  const { DIALOG_SHELL_CLASS } = dialogLoad('components/ui/responsive-dialog.ts')
  const { WORK_ITEM_DIALOG_SHELL_CLASS } = dialogLoad('components/page/work-items/work-item-dialog-shell.ts')
  const { BoardWorkItemDialog } = dialogLoad('components/page/board/board-work-item-dialog.tsx')
  const workItemDialogSource = readFileSync(`${root}/components/page/work-items/work-item-dialog.tsx`, 'utf8')
  const workItemViewDialogSource = readFileSync(`${root}/components/page/work-items/work-item-view-dialog.tsx`, 'utf8')
  const item = {
    id: 'work-item-27', title: 'Review responsive dialog', kind: 'Task', status: 'todo', priority: 'medium', role: null,
    description: 'Modal content', workDate: '2026-10-03', dueDate: '2026-10-04', assignee: { name: 'Owner' },
    project: { name: 'Project Alpha', company: { name: 'Example Company' } },
  }

  assert.equal(WORK_ITEM_DIALOG_SHELL_CLASS, DIALOG_SHELL_CLASS)
  assert.match(workItemDialogSource, /<DialogContent className={WORK_ITEM_DIALOG_SHELL_CLASS}>/)
  assert.match(workItemViewDialogSource, /<DialogContent className={WORK_ITEM_DIALOG_SHELL_CLASS}>/)
  const html = renderToStaticMarkup(React.createElement(BoardWorkItemDialog, { item, onOpenChange() {} }))
  assert.ok(html.includes(`class="${DIALOG_SHELL_CLASS}"`))
  assert.match(DIALOG_SHELL_CLASS, /lg:max-w-\[54\.6rem\]/)
})
