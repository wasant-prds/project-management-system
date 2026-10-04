import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import vm from 'node:vm'

const require = createRequire(import.meta.url)
const ts = require('typescript')

function component(name) {
  const value = (props) => ({ type: value, props })
  value.displayName = name
  return value
}

function createRuntime(initialState = {}) {
  const state = new Map(Object.entries(initialState).map(([index, value]) => [Number(index), value]))
  const effects = []
  let index = 0
  return {
    useState(initial) {
      const slot = index++
      if (!state.has(slot)) state.set(slot, typeof initial === 'function' ? initial() : initial)
      return [state.get(slot), (next) => state.set(slot, typeof next === 'function' ? next(state.get(slot)) : next)]
    },
    useEffect(effect) { effects.push(effect) },
    useCallback(callback) { return callback },
    use(value) { return { id: 'project-1' } },
    render(Page, props = {}) {
      index = 0
      return Page(props)
    },
    effects,
  }
}

function loadPage(relativePath, { initialState, fetcher = async () => ({ ok: true, json: async () => ({}) }), companies = [], projects = [], collectionFetcher } = {}) {
  const runtime = createRuntime(initialState)
  const names = [
    'AppSidebar', 'AppHeader', 'SidebarProvider', 'SidebarInset', 'Card', 'CardContent', 'CardHeader', 'CardTitle',
    'Button', 'Input', 'Label', 'Textarea', 'Select', 'SelectContent', 'SelectItem', 'SelectTrigger', 'SelectValue',
    'AlertDialog', 'AlertDialogAction', 'AlertDialogCancel', 'AlertDialogContent', 'AlertDialogDescription',
    'AlertDialogFooter', 'AlertDialogHeader', 'AlertDialogTitle', 'Link', 'Badge', 'Progress',
  ]
  const ui = Object.fromEntries(names.map((name) => [name, component(name)]))
  const routerCalls = []
  const mocks = {
    react: runtime,
    'react/jsx-runtime': {
      jsx: (type, props) => type?.renderInTest ? type(props) : ({ type, props }),
      jsxs: (type, props) => type?.renderInTest ? type(props) : ({ type, props }),
      Fragment: component('Fragment'),
    },
    'next/link': { default: ui.Link },
    'next/navigation': {
      useRouter: () => ({ push: (path) => routerCalls.push(path) }),
      useSearchParams: () => new URLSearchParams(),
    },
    '@/components/layout/app-sidebar': { AppSidebar: ui.AppSidebar },
    '@/components/layout/app-header': { AppHeader: ui.AppHeader },
    '@/components/layout/page-layout': {
      PAGE_HEADING: 'PAGE_HEADING', PAGE_INNER: 'PAGE_INNER', PAGE_LEAD: 'PAGE_LEAD', PAGE_MAIN: 'PAGE_MAIN', PAGE_TOOLBAR: 'PAGE_TOOLBAR',
    },
    '@/components/ui/sidebar': { SidebarProvider: ui.SidebarProvider, SidebarInset: ui.SidebarInset },
    '@/components/ui/card': { Card: ui.Card, CardContent: ui.CardContent, CardHeader: ui.CardHeader, CardTitle: ui.CardTitle },
    '@/components/ui/button': { Button: ui.Button },
    '@/components/ui/badge': { Badge: ui.Badge },
    '@/components/ui/progress': { Progress: ui.Progress },
    '@/components/ui/motion': { MOTION_CLASS: { valueChange: 'motion-value-change' } },
    '@/components/ui/metric-motion': { canTweenMetric: (value) => typeof value === 'number' && Number.isSafeInteger(value) },
    '@/components/ui/animated-stat-value': {
      AnimatedStatValue: Object.assign(({ value }) => ({ type: 'span', props: { children: value } }), { renderInTest: true }),
    },
    './content-loading-skeleton': { ContentLoadingSkeleton: component('ContentLoadingSkeleton') },
    '@/lib/utils': { cn: (...values) => values.filter(Boolean).join(' ') },
    'lucide-react': Object.fromEntries(['ArrowUpRight', 'CalendarDays', 'FolderKanban', 'Building2', 'MapPin', 'Phone', 'CircleAlert', 'Inbox', 'LoaderCircle'].map((name) => [name, component(name)])),
    '@/components/ui/input': { Input: ui.Input },
    '@/components/ui/label': { Label: ui.Label },
    '@/components/ui/textarea': { Textarea: ui.Textarea },
    '@/components/ui/select': {
      Select: ui.Select, SelectContent: ui.SelectContent, SelectItem: ui.SelectItem,
      SelectTrigger: ui.SelectTrigger, SelectValue: ui.SelectValue,
    },
    '@/components/ui/alert-dialog': {
      AlertDialog: ui.AlertDialog, AlertDialogAction: ui.AlertDialogAction, AlertDialogCancel: ui.AlertDialogCancel,
      AlertDialogContent: ui.AlertDialogContent, AlertDialogDescription: ui.AlertDialogDescription,
      AlertDialogFooter: ui.AlertDialogFooter, AlertDialogHeader: ui.AlertDialogHeader, AlertDialogTitle: ui.AlertDialogTitle,
    },
    '@/lib/fetch-collection': {
      fetchCollection: async (path, key) => collectionFetcher
        ? collectionFetcher(path, key)
        : key === 'companies' ? companies : projects,
    },
  }
  const source = readFileSync(new URL(relativePath, import.meta.url), 'utf8')
  const js = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText
  const module = { exports: {} }
  vm.runInNewContext(js, {
    module, exports: module.exports,
    require: (name) => {
      if (!(name in mocks) && ['@/components/page/projects/portfolio-card', '@/components/page/company/company-card', '@/components/layout/page-state', '@/components/layout/summary-stat-card'].includes(name)) {
        const childSource = readFileSync(new URL(`../../${name.slice(2)}.tsx`, import.meta.url), 'utf8')
        const childJs = ts.transpileModule(childSource, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText
        const child = { exports: {} }
        vm.runInNewContext(childJs, { module: child, exports: child.exports, require: (dependency) => {
          if (!(dependency in mocks)) throw new Error(`Unexpected presentation import: ${dependency}`)
          return mocks[dependency]
        }, encodeURIComponent }, { filename: name })
        for (const value of Object.values(child.exports)) value.renderInTest = true
        mocks[name] = child.exports
      }
      if (!(name in mocks)) throw new Error(`Unexpected UI import: ${name}`)
      return mocks[name]
    },
    fetch: fetcher, URLSearchParams, encodeURIComponent, window: { scrollTo() {}, location: { search: '' } }, document: { getElementById: () => ({ scrollIntoView() {} }) },
    console, Date, Error, URL, setTimeout, clearTimeout,
  }, { filename: relativePath })
  return { Page: module.exports.default, runtime, ui, routerCalls }
}

async function runEffects(page) {
  for (const effect of page.runtime.effects.splice(0)) effect()
  await new Promise((resolve) => setImmediate(resolve))
}

function walk(element, visit) {
  if (Array.isArray(element)) return element.forEach((child) => walk(child, visit))
  if (!element || typeof element !== 'object') return
  visit(element)
  walk(element.props?.children, visit)
}

function textContent(element) {
  if (Array.isArray(element)) return element.map(textContent).join('')
  if (element === null || element === undefined || typeof element === 'boolean') return ''
  if (typeof element !== 'object') return String(element)
  return textContent(element.props?.children)
}

function find(element, predicate) {
  let result
  walk(element, (node) => { if (!result && predicate(node)) result = node })
  return result
}

const project = {
  id: 'project-1', name: 'Project Alpha', description: null, status: 'Planning', priority: 'Medium',
  startDate: '2026-09-01', dueDate: '2026-10-01', company: { id: 'company-1', name: 'Company One', displayName: null },
  summary: { statusCounts: {}, roles: {}, total: 0, completed: 0, progress: 0, hours: '0' }, workItems: [], timeEntries: [],
}

test('Project detail confirms deletion, navigates on success, and shows history conflict codes', async () => {
  const calls = []
  let nextResult = { ok: true, json: async () => ({ message: 'deleted' }) }
  const page = loadPage('../../app/projects/[id]/page.tsx', {
    initialState: { 0: project, 2: false },
    fetcher: async (path, options) => { calls.push({ path, options }); return nextResult },
  })
  let tree = page.runtime.render(page.Page, { params: Promise.resolve({ id: project.id }) })
  const open = find(tree, (node) => node.type === page.ui.Button && textContent(node) === 'ลบ Project')
  assert.ok(open)
  open.props.onClick()
  tree = page.runtime.render(page.Page, { params: Promise.resolve({ id: project.id }) })
  const confirm = find(tree, (node) => node.type === page.ui.AlertDialogAction)
  assert.equal(textContent(confirm), 'ยืนยันลบ Project')
  await confirm.props.onClick({ preventDefault() {} })
  assert.equal(JSON.stringify(calls[0]), JSON.stringify({ path: '/api/projects/project-1', options: { method: 'DELETE' } }))
  assert.deepEqual(page.routerCalls, ['/projects'])

  nextResult = { ok: false, json: async () => ({ error: { code: 'HISTORY_CONFLICT', message: 'Project has history' } }) }
  tree = page.runtime.render(page.Page, { params: Promise.resolve({ id: project.id }) })
  find(tree, (node) => node.type === page.ui.Button && textContent(node) === 'ลบ Project').props.onClick()
  tree = page.runtime.render(page.Page, { params: Promise.resolve({ id: project.id }) })
  await find(tree, (node) => node.type === page.ui.AlertDialogAction).props.onClick({ preventDefault() {} })
  tree = page.runtime.render(page.Page, { params: Promise.resolve({ id: project.id }) })
  assert.match(textContent(find(tree, (node) => node.props?.role === 'alert')), /HISTORY_CONFLICT/)
  assert.deepEqual(page.routerCalls, ['/projects'])
})

test('Company deletion requires the alert-dialog confirmation', async () => {
  const requests = []
  const company = {
    id: 'company-2', code: null, name: 'Company Two', displayName: null, location: null, address: null,
    phone: null, description: null, summary: { projects: 0, workItems: 0, hours: '0' },
  }
  const page = loadPage('../../app/company/page.tsx', {
    initialState: { 0: [company], 4: false },
    companies: [],
    fetcher: async (path, options) => {
      requests.push({ path, options })
      return { ok: true, json: async () => ({}) }
    },
  })
  let tree = page.runtime.render(page.Page)
  find(tree, (node) => node.type === page.ui.Button && textContent(node) === 'ลบ').props.onClick()
  tree = page.runtime.render(page.Page)
  const confirm = find(tree, (node) => node.type === page.ui.AlertDialogAction)
  assert.equal(textContent(confirm), 'ยืนยันลบ Company')
  await confirm.props.onClick({ preventDefault() {} })
  assert.equal(JSON.stringify(requests[0]), JSON.stringify({ path: '/api/company/company-2', options: { method: 'DELETE' } }))
  assert.equal(requests.filter((request) => request.options?.method === 'DELETE').length, 1)
})

test('Company create and edit persist through the form and show API errors', async () => {
  const company = {
    id: 'company-2', code: null, name: 'Company Two', displayName: null, location: null, address: null,
    phone: null, description: null, summary: { projects: 0, workItems: 0, hours: '0' },
  }
  const requests = []
  const page = loadPage('../../app/company/page.tsx', {
    initialState: { 0: [company], 4: false },
    companies: [company],
    fetcher: async (path, options) => {
      requests.push({ path, options })
      return requests.length === 1
        ? { ok: true, json: async () => ({ company: { id: 'new-company' } }) }
        : { ok: false, json: async () => ({ error: { code: 'PROJECTS_EXIST', message: 'Company has Projects' } }) }
    },
  })

  let tree = page.runtime.render(page.Page)
  assert.equal(find(tree, (node) => node.type === 'details').props.open, undefined)
  const name = find(tree, (node) => node.type === page.ui.Input && node.props.id === 'company-name')
  name.props.onChange({ target: { value: 'New Company' } })
  tree = page.runtime.render(page.Page)
  const displayName = find(tree, (node) => node.type === page.ui.Input && node.props.id === 'company-displayName')
  displayName.props.onChange({ target: { value: 'New' } })
  tree = page.runtime.render(page.Page)
  await find(tree, (node) => node.type === 'form').props.onSubmit({ preventDefault() {} })
  assert.equal(requests[0].path, '/api/company')
  assert.equal(requests[0].options.method, 'POST')
  assert.deepEqual(JSON.parse(requests[0].options.body), {
    name: 'New Company', displayName: 'New', location: '', address: '', phone: '', description: '',
  })

  tree = page.runtime.render(page.Page)
  find(tree, (node) => node.type === page.ui.Button && textContent(node) === 'แก้ไข').props.onClick()
  tree = page.runtime.render(page.Page)
  const phone = find(tree, (node) => node.type === page.ui.Input && node.props.id === 'company-phone')
  assert.equal(find(tree, (node) => node.type === 'details').props.open, true)
  phone.props.onChange({ target: { value: '02 123 4567' } })
  tree = page.runtime.render(page.Page)
  await find(tree, (node) => node.type === 'form').props.onSubmit({ preventDefault() {} })
  assert.equal(requests[1].path, '/api/company/company-2')
  assert.equal(requests[1].options.method, 'PATCH')
  assert.equal(JSON.parse(requests[1].options.body).phone, '02 123 4567')
  tree = page.runtime.render(page.Page)
  assert.match(textContent(find(tree, (node) => node.type === 'output')), /PROJECTS_EXIST: Company has Projects/)
})

test('Project create and edit persist a Company relation and surface API failures', async () => {
  const companies = [{ id: 'co1', name: 'Dhas', displayName: null }]
  const projects = [project]
  const createRequests = []
  const createPage = loadPage('../../app/projects/page.tsx', {
    initialState: { 0: projects, 1: companies, 8: false },
    companies,
    projects,
    fetcher: async (path, options) => {
      createRequests.push({ path, options })
      return { ok: true, json: async () => ({ project: { ...project, id: 'new-project' } }) }
    },
  })

  const changeInput = (id, value) => {
    const tree = createPage.runtime.render(createPage.Page)
    find(tree, (node) => node.type === createPage.ui.Input && node.props.id === id).props.onChange({ target: { value } })
  }
  changeInput('project-name', 'Created Project')
  changeInput('project-start', '2026-09-01')
  changeInput('project-due', '2026-10-01')
  let tree = createPage.runtime.render(createPage.Page)
  const companySelect = find(tree, (node) => node.type === createPage.ui.Select && find(node.props.children, (child) => child.type === createPage.ui.SelectTrigger && child.props.id === 'project-company'))
  companySelect.props.onValueChange('co1')
  tree = createPage.runtime.render(createPage.Page)
  await find(tree, (node) => node.type === 'form').props.onSubmit({ preventDefault() {} })
  assert.equal(createRequests[0].path, '/api/projects')
  assert.equal(createRequests[0].options.method, 'POST')
  assert.deepEqual(JSON.parse(createRequests[0].options.body), {
    name: 'Created Project', companyId: 'co1', startDate: '2026-09-01', dueDate: '2026-10-01', status: 'Planning', priority: 'Medium',
  })

  const editRequests = []
  const editPage = loadPage('../../app/projects/page.tsx', {
    initialState: { 0: projects, 1: companies, 8: false }, companies, projects,
    fetcher: async (path, options) => {
      editRequests.push({ path, options })
      if (options?.method === 'PATCH') return { ok: false, json: async () => ({ error: { code: 'COMPANY_CONFLICT', message: 'Choose another Company' } }) }
      return { ok: true, json: async () => ({ project }) }
    },
  })
  tree = editPage.runtime.render(editPage.Page)
  assert.equal(find(tree, (node) => node.type === 'details').props.open, undefined)
  await find(tree, (node) => node.type === editPage.ui.Button && textContent(node) === 'แก้ไข').props.onClick()
  tree = editPage.runtime.render(editPage.Page)
  assert.equal(find(tree, (node) => node.type === 'details').props.open, true)
  find(tree, (node) => node.type === editPage.ui.Input && node.props.id === 'project-name').props.onChange({ target: { value: 'Updated Project' } })
  tree = editPage.runtime.render(editPage.Page)
  await find(tree, (node) => node.type === 'form').props.onSubmit({ preventDefault() {} })
  assert.equal(editRequests[0].path, '/api/projects/project-1')
  assert.equal(editRequests[0].options, undefined)
  assert.equal(editRequests[1].path, '/api/projects/project-1')
  assert.equal(editRequests[1].options.method, 'PATCH')
  assert.equal(JSON.parse(editRequests[1].options.body).name, 'Updated Project')
  tree = editPage.runtime.render(editPage.Page)
  assert.match(textContent(find(tree, (node) => node.type === 'output')), /Choose another Company/)
})

test('Project list search and Company filters select matching summaries', () => {
  const projects = [
    { id: 'p1', name: 'Alpha Project', status: 'Planning', priority: 'Low', dueDate: '2026-10-01', companyId: 'co1', company: { id: 'co1', name: 'Dhas', displayName: null }, summary: { total: 1, completed: 0, open: 1, progress: 0, hours: '2' } },
    { id: 'p2', name: 'Beta Project', status: 'In Progress', priority: 'High', dueDate: '2026-10-02', companyId: 'co2', company: { id: 'co2', name: 'Other', displayName: null }, summary: { total: 2, completed: 1, open: 1, progress: 50, hours: '3' } },
  ]
  const page = loadPage('../../app/projects/page.tsx', {
    initialState: { 0: projects, 1: [{ id: 'co1', name: 'Dhas', displayName: null }, { id: 'co2', name: 'Other', displayName: null }], 8: false },
    projects,
  })
  let tree = page.runtime.render(page.Page)
  find(tree, (node) => node.type === page.ui.Input && node.props['aria-label'] === 'ค้นหา Project').props.onChange({ target: { value: 'Alpha' } })
  tree = page.runtime.render(page.Page)
  assert.match(textContent(tree), /Alpha Project/)
  assert.doesNotMatch(textContent(tree), /Beta Project/)
  find(tree, (node) => node.type === page.ui.Input && node.props['aria-label'] === 'ค้นหา Project').props.onChange({ target: { value: '' } })
  tree = page.runtime.render(page.Page)
  const companyFilter = find(tree, (node) => node.type === page.ui.Select && find(node.props.children, (child) => child.type === page.ui.SelectTrigger && child.props['aria-label'] === 'กรอง Company'))
  assert.ok(companyFilter)
  companyFilter.props.onValueChange('co2')
  tree = page.runtime.render(page.Page)
  assert.match(textContent(tree), /Beta Project/)
  assert.doesNotMatch(textContent(tree), /Alpha Project/)
})

test('Company collection failures show an alert instead of a false empty state and can be retried', async () => {
  const company = {
    id: 'company-3', code: null, name: 'Recovered Company', displayName: null, location: null, address: null,
    phone: null, description: null, summary: { projects: 0, workItems: 0, hours: '0' },
  }
  let shouldFail = true
  const page = loadPage('../../app/company/page.tsx', {
    collectionFetcher: async () => {
      if (shouldFail) throw new Error('API unavailable')
      return [company]
    },
  })

  page.runtime.render(page.Page)
  await runEffects(page)
  let tree = page.runtime.render(page.Page)
  assert.equal(find(tree, (node) => node.props?.role === 'alert')?.props['data-slot'], 'page-state')
  assert.match(textContent(tree), /API unavailable/)
  assert.match(textContent(tree), /โหลดไม่สำเร็จ/)
  assert.doesNotMatch(textContent(tree), /0 บริษัท|ยังไม่มี Company|เพิ่มข้อมูลบริษัทเพื่อเริ่ม/)

  shouldFail = false
  find(tree, (node) => node.type === page.ui.Button && textContent(node) === 'ลองอีกครั้ง').props.onClick()
  await new Promise((resolve) => setImmediate(resolve))
  tree = page.runtime.render(page.Page)
  assert.match(textContent(tree), /1 บริษัท/)
  assert.match(textContent(tree), /Recovered Company/)
  assert.equal(find(tree, (node) => node.props?.role === 'alert'), undefined)
})

test('Project collection failures show an alert instead of a false empty state and can be retried', async () => {
  let shouldFail = true
  const page = loadPage('../../app/projects/page.tsx', {
    collectionFetcher: async () => {
      if (shouldFail) throw new Error('Project API unavailable')
      return []
    },
  })

  page.runtime.render(page.Page)
  await runEffects(page)
  let tree = page.runtime.render(page.Page)
  assert.equal(find(tree, (node) => node.props?.role === 'alert')?.props['data-slot'], 'page-state')
  assert.match(textContent(tree), /Project API unavailable/)
  assert.match(textContent(tree), /โหลดไม่สำเร็จ/)
  assert.doesNotMatch(textContent(tree), /0 รายการ|ไม่พบ Project|สร้าง Project โดยเลือก Company/)

  shouldFail = false
  find(tree, (node) => node.type === page.ui.Button && textContent(node) === 'ลองอีกครั้ง').props.onClick()
  await new Promise((resolve) => setImmediate(resolve))
  tree = page.runtime.render(page.Page)
  assert.match(textContent(tree), /0 รายการ/)
  assert.match(textContent(tree), /ไม่พบ Project/)
  assert.equal(find(tree, (node) => node.props?.role === 'alert'), undefined)
})
