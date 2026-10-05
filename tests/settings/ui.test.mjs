import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import test from 'node:test'
import vm from 'node:vm'

const require = createRequire(import.meta.url)
const typescript = require('typescript')

function component(name) {
  const value = (props) => ({ type: value, props })
  value.displayName = name
  return value
}

function createRuntime(initialState = {}, deferStateUpdates = false) {
  const state = new Map(Object.entries(initialState).map(([index, value]) => [Number(index), value]))
  const pendingUpdates = []
  let index = 0
  return {
    useState(initial) {
      const slot = index++
      if (!state.has(slot)) state.set(slot, typeof initial === 'function' ? initial() : initial)
      return [state.get(slot), (next) => {
        const update = () => state.set(slot, typeof next === 'function' ? next(state.get(slot)) : next)
        if (deferStateUpdates) pendingUpdates.push(update)
        else update()
      }]
    },
    useEffect() {},
    render(Page) {
      index = 0
      return Page()
    },
    flushStateUpdates() {
      while (pendingUpdates.length > 0) pendingUpdates.shift()()
    },
    stateValue(slot) { return state.get(slot) },
  }
}

function compile(sourcePath, mocks, runtime, filename) {
  const source = readFileSync(new URL(sourcePath, import.meta.url), 'utf8')
  const output = typescript.transpileModule(source, {
    compilerOptions: { module: typescript.ModuleKind.CommonJS, target: typescript.ScriptTarget.ES2022, jsx: typescript.JsxEmit.ReactJSX },
  }).outputText
  const loadedModule = { exports: {} }
  vm.runInNewContext(output, {
    module: loadedModule,
    exports: loadedModule.exports,
    require: (name) => {
      if (Object.hasOwn(mocks, name)) return mocks[name]
      throw new Error(`Unexpected import: ${name}`)
    },
    console,
    Error,
    URL,
  }, { filename })
  return loadedModule.exports
}

function savedSettings(overrides = {}) {
  return {
    profile: { name: 'Owner', email: 'owner@example.test', phone: null, avatar: null, ...overrides.profile },
    preferences: { theme: 'light', locale: 'th', timezone: 'Asia/Bangkok', ...overrides.preferences },
  }
}

function makeController(options = {}) {
  const controller = {
    settings: options.settings === undefined ? savedSettings() : options.settings,
    isLoading: options.isLoading ?? false,
    loadError: options.loadError ?? null,
    isSavingProfile: options.isSavingProfile ?? false,
    isSavingPreferences: options.isSavingPreferences ?? false,
    profileCalls: [],
    preferenceCalls: [],
    reloadCalls: 0,
  }
  controller.reload = options.reload ?? (() => { controller.reloadCalls += 1 })
  controller.saveProfile = options.saveProfile ?? (async (profile) => {
    controller.profileCalls.push(profile)
    controller.settings = { ...controller.settings, profile: { ...controller.settings.profile, ...profile } }
  })
  controller.savePreferences = options.savePreferences ?? (async (preferences) => {
    controller.preferenceCalls.push(preferences)
    controller.settings = { ...controller.settings, preferences: { ...controller.settings.preferences, ...preferences } }
    if (preferences.theme) options.themeChanges?.push(preferences.theme)
  })
  return controller
}

function loadPage(controller, themeChanges = [], deferStateUpdates = false) {
  const runtime = createRuntime({}, deferStateUpdates)
  const names = [
    'AppSidebar', 'AppHeader', 'SidebarProvider', 'SidebarInset', 'Card', 'CardContent', 'CardHeader', 'CardTitle',
    'CardDescription', 'Button', 'Input', 'Label', 'Tabs', 'TabsContent', 'TabsList', 'TabsTrigger', 'Avatar',
    'AvatarFallback', 'AvatarImage',
  ]
  const ui = Object.fromEntries(names.map((name) => [name, component(name)]))
  const mocks = {
    react: runtime,
    'react/jsx-runtime': {
      jsx: (type, props) => (type?.renderInTest ? type(props) : { type, props }),
      jsxs: (type, props) => (type?.renderInTest ? type(props) : { type, props }),
      Fragment: component('Fragment'),
    },
    '@/components/layout/page-state': {
      PageState: Object.assign(function PageState(props) {
        return {
          type: 'div',
          props: {
            role: props.kind === 'error' ? 'alert' : 'status',
            'data-slot': 'page-state',
            'data-visual': props.visual,
            children: [props.title, props.description, props.action],
          },
        }
      }, { renderInTest: true }),
    },
    '@/components/ui/product-identity': {
      loadFailureVisual(message) {
        const normalized = String(message).trim().toLowerCase()
        if (normalized === 'failed to fetch' || normalized === 'load failed' || normalized.startsWith('networkerror') || normalized.includes('network request failed')) return 'network'
        return 'error'
      },
    },
    '@/components/layout/owner-settings-provider': { useOwnerSettings: () => controller },
    '@/components/layout/app-sidebar': { AppSidebar: ui.AppSidebar },
    '@/components/layout/app-header': { AppHeader: ui.AppHeader },
    '@/components/layout/content-loading-skeleton': { ContentLoadingSkeleton: component('ContentLoadingSkeleton') },
    '@/components/layout/page-layout': {
      PAGE_HEADING: 'PAGE_HEADING', PAGE_INNER: 'PAGE_INNER', PAGE_LEAD: 'PAGE_LEAD', PAGE_MAIN: 'PAGE_MAIN',
      TAB_SCROLL_CLASS: 'TAB_SCROLL_CLASS', TAB_TRIGGER_CLASS: 'TAB_TRIGGER_CLASS',
    },
    '@/components/ui/sidebar': { SidebarProvider: ui.SidebarProvider, SidebarInset: ui.SidebarInset },
    '@/components/ui/card': { Card: ui.Card, CardContent: ui.CardContent, CardHeader: ui.CardHeader, CardTitle: ui.CardTitle, CardDescription: ui.CardDescription },
    '@/components/ui/button': { Button: ui.Button },
    '@/components/ui/input': { Input: ui.Input },
    '@/components/ui/label': { Label: ui.Label },
    '@/components/ui/tabs': { Tabs: ui.Tabs, TabsContent: ui.TabsContent, TabsList: ui.TabsList, TabsTrigger: ui.TabsTrigger },
    '@/components/ui/avatar': { Avatar: ui.Avatar, AvatarFallback: ui.AvatarFallback, AvatarImage: ui.AvatarImage },
    '@/lib/settings-input': {
      SETTINGS_THEMES: ['light', 'dark', 'special-dark'],
      SETTINGS_LOCALES: ['th', 'en'],
    },
  }
  const pageModule = compile('../../app/settings/page.tsx', mocks, runtime, 'app/settings/page.tsx')
  return { Page: pageModule.default, runtime, ui, controller, themeChanges }
}

function loadThemeToggle({ controller, themeChanges = [], toastCalls = [], theme = 'light' }) {
  const runtime = createRuntime({ 0: true, 1: null })
  const ui = Object.fromEntries(['Button', 'DropdownMenu', 'DropdownMenuContent', 'DropdownMenuItem', 'DropdownMenuTrigger'].map((name) => [name, component(name)]))
  const mocks = {
    react: runtime,
    'react/jsx-runtime': {
      jsx: (type, props) => ({ type, props }),
      jsxs: (type, props) => ({ type, props }),
      Fragment: component('Fragment'),
    },
    'lucide-react': { Moon: component('Moon'), Sun: component('Sun'), Sparkles: component('Sparkles') },
    'next-themes': { useTheme: () => ({ theme, setTheme: (value) => themeChanges.push(value) }) },
    '@/components/layout/owner-settings-provider': { useOwnerSettings: () => controller },
    '@/components/ui/button': { Button: ui.Button },
    '@/components/ui/dropdown-menu': {
      DropdownMenu: ui.DropdownMenu,
      DropdownMenuContent: ui.DropdownMenuContent,
      DropdownMenuItem: ui.DropdownMenuItem,
      DropdownMenuTrigger: ui.DropdownMenuTrigger,
    },
    '@/hooks/use-toast': { toast: (value) => toastCalls.push(value) },
  }
  const toggleModule = compile('../../components/ui/theme-toggle.tsx', mocks, runtime, 'components/ui/theme-toggle.tsx')
  return { ThemeToggle: toggleModule.ThemeToggle, runtime, ui, controller }
}

function walk(element, visit) {
  if (Array.isArray(element)) return element.forEach((child) => walk(child, visit))
  if (!element || typeof element !== 'object') return
  visit(element)
  walk(element.props?.children, visit)
}

function find(element, predicate) {
  let result
  walk(element, (node) => { if (!result && predicate(node)) result = node })
  return result
}

function textContent(element) {
  if (Array.isArray(element)) return element.map(textContent).join('')
  if (element === null || element === undefined || typeof element === 'boolean') return ''
  if (typeof element !== 'object') return String(element)
  return textContent(element.props?.children)
}

function byComponent(tree, ui, name, predicate = () => true) {
  return find(tree, (node) => node.type === ui[name] && predicate(node))
}

function formsIn(tree) {
  const forms = []
  walk(tree, (node) => { if (node.type === 'form') forms.push(node) })
  return forms
}

test('Settings renders persisted owner values and the fixed timezone without unsupported tabs', () => {
  const controller = makeController({ settings: savedSettings({
    profile: { name: 'Wasant', email: 'wasant@example.test', phone: '0800000000' },
    preferences: { theme: 'dark', locale: 'en' },
  }) })
  const page = loadPage(controller)
  const tree = page.runtime.render(page.Page)

  assert.equal(byComponent(tree, page.ui, 'Input', (node) => node.props.id === 'owner-name').props.value, 'Wasant')
  assert.equal(byComponent(tree, page.ui, 'Input', (node) => node.props.id === 'owner-email').props.value, 'wasant@example.test')
  assert.equal(byComponent(tree, page.ui, 'Input', (node) => node.props.id === 'owner-phone').props.value, '0800000000')
  const timezone = byComponent(tree, page.ui, 'Input', (node) => node.props.id === 'owner-timezone')
  assert.equal(timezone.props.value, 'Asia/Bangkok')
  assert.equal(timezone.props.readOnly, true)
  assert.match(textContent(tree), /โปรไฟล์/)
  assert.match(textContent(tree), /การแสดงผล/)
  assert.doesNotMatch(textContent(tree), /Notifications|Two-Factor|Password|Compact View/)
})

test('Settings shows loading and retryable load-error states', () => {
  const loadingPage = loadPage(makeController({ settings: null, isLoading: true }))
  const loadingTree = loadingPage.runtime.render(loadingPage.Page)
  const loadingStatus = find(loadingTree, (node) => node.props?.role === 'status')
  assert.match(textContent(loadingStatus), /กำลังโหลดการตั้งค่า/)
  assert.equal(loadingStatus.props['aria-busy'], 'true')
  assert.equal(find(loadingTree, (node) => node.type?.displayName === 'ContentLoadingSkeleton').props.layout, 'profile')

  const errorPage = loadPage(makeController({ settings: null, loadError: 'API unavailable' }))
  let errorTree = errorPage.runtime.render(errorPage.Page)
  const errorState = find(errorTree, (node) => node.props?.['data-slot'] === 'page-state')
  assert.equal(errorState.props['data-visual'], 'error')
  assert.match(textContent(errorTree), /API unavailable/)
  const networkPage = loadPage(makeController({ settings: null, loadError: 'Failed to fetch' }))
  const networkState = find(networkPage.runtime.render(networkPage.Page), (node) => node.props?.['data-slot'] === 'page-state')
  assert.equal(networkState.props['data-visual'], 'network')
  assert.match(textContent(networkState), /Failed to fetch/)
  byComponent(errorTree, errorPage.ui, 'Button', (node) => textContent(node) === 'ลองโหลดอีกครั้ง').props.onClick()
  assert.equal(errorPage.controller.reloadCalls, 1)
  errorTree = errorPage.runtime.render(errorPage.Page)
  assert.match(textContent(errorTree), /API unavailable/)
})

test('Profile form sends only edited fields and Cancel restores the latest saved profile', async () => {
  const controller = makeController({ settings: savedSettings({ profile: { name: 'Saved Name' } }) })
  const page = loadPage(controller)
  let tree = page.runtime.render(page.Page)
  byComponent(tree, page.ui, 'Input', (node) => node.props.id === 'owner-name').props.onChange({ currentTarget: { value: 'Updated Name' } })
  tree = page.runtime.render(page.Page)
  await formsIn(tree)[0].props.onSubmit({ preventDefault() {} })

  assert.deepEqual(JSON.parse(JSON.stringify(controller.profileCalls[0])), { name: 'Updated Name' })
  tree = page.runtime.render(page.Page)
  assert.match(textContent(tree), /บันทึกโปรไฟล์แล้ว/)

  byComponent(tree, page.ui, 'Input', (node) => node.props.id === 'owner-name').props.onChange({ currentTarget: { value: 'Unsaved Name' } })
  tree = page.runtime.render(page.Page)
  const cancel = byComponent(tree, page.ui, 'Button', (node) => textContent(node) === 'ยกเลิก')
  cancel.props.onClick()
  tree = page.runtime.render(page.Page)
  assert.equal(byComponent(tree, page.ui, 'Input', (node) => node.props.id === 'owner-name').props.value, 'Updated Name')
})

test('Preferences send only changed theme and locale, leaving the fixed timezone unchanged', async () => {
  const themeChanges = []
  const controller = makeController({ themeChanges })
  const page = loadPage(controller, themeChanges)
  let tree = page.runtime.render(page.Page)
  find(tree, (node) => node.type === 'select' && node.props.id === 'owner-theme').props.onChange({ currentTarget: { value: 'special-dark' } })
  tree = page.runtime.render(page.Page)
  find(tree, (node) => node.type === 'select' && node.props.id === 'owner-locale').props.onChange({ currentTarget: { value: 'en' } })
  tree = page.runtime.render(page.Page)
  await formsIn(tree)[1].props.onSubmit({ preventDefault() {} })

  assert.deepEqual(JSON.parse(JSON.stringify(controller.preferenceCalls[0])), { theme: 'special-dark', locale: 'en' })
  assert.deepEqual(themeChanges, ['special-dark'])
  assert.equal(controller.settings.preferences.timezone, 'Asia/Bangkok')
  assert.match(textContent(page.runtime.render(page.Page)), /บันทึกการตั้งค่าแล้ว/)
})

test('Settings reports a failed save and leaves the canonical theme unchanged', async () => {
  const themeChanges = []
  const controller = makeController({
    themeChanges,
    savePreferences: async () => { throw new Error('อีเมลไม่ถูกต้อง') },
  })
  const page = loadPage(controller, themeChanges)
  let tree = page.runtime.render(page.Page)
  find(tree, (node) => node.type === 'select' && node.props.id === 'owner-theme').props.onChange({ currentTarget: { value: 'dark' } })
  tree = page.runtime.render(page.Page)
  await formsIn(tree)[1].props.onSubmit({ preventDefault() {} })
  tree = page.runtime.render(page.Page)

  assert.match(textContent(tree), /อีเมลไม่ถูกต้อง/)
  assert.equal(controller.settings.preferences.theme, 'light')
  assert.deepEqual(themeChanges, [])
})

test('Header theme changes and Settings share canonical preferences across Cancel and partial Save', async () => {
  const themeChanges = []
  const controller = makeController({ themeChanges })
  const page = loadPage(controller, themeChanges)
  const toastCalls = []
  const toggle = loadThemeToggle({ controller, themeChanges, toastCalls })
  let toggleTree = toggle.runtime.render(toggle.ThemeToggle)
  await byComponent(toggleTree, toggle.ui, 'DropdownMenuItem', (node) => textContent(node) === 'Dark').props.onClick()

  let tree = page.runtime.render(page.Page)
  assert.equal(find(tree, (node) => node.type === 'select' && node.props.id === 'owner-theme').props.value, 'dark')
  find(tree, (node) => node.type === 'select' && node.props.id === 'owner-locale').props.onChange({ currentTarget: { value: 'en' } })
  tree = page.runtime.render(page.Page)
  byComponent(formsIn(tree)[1], page.ui, 'Button', (node) => textContent(node) === 'ยกเลิก').props.onClick()
  tree = page.runtime.render(page.Page)
  assert.equal(find(tree, (node) => node.type === 'select' && node.props.id === 'owner-theme').props.value, 'dark')
  assert.equal(find(tree, (node) => node.type === 'select' && node.props.id === 'owner-locale').props.value, 'th')
  assert.deepEqual(themeChanges, ['dark'])

  find(tree, (node) => node.type === 'select' && node.props.id === 'owner-locale').props.onChange({ currentTarget: { value: 'en' } })
  tree = page.runtime.render(page.Page)
  await formsIn(tree)[1].props.onSubmit({ preventDefault() {} })
  assert.deepEqual(JSON.parse(JSON.stringify(controller.preferenceCalls)), [{ theme: 'dark' }, { locale: 'en' }])
  assert.deepEqual(controller.settings.preferences, { theme: 'dark', locale: 'en', timezone: 'Asia/Bangkok' })
  assert.deepEqual(themeChanges, ['dark'])
  assert.equal(toastCalls.length, 0)
})

test('Settings change handlers capture event values before deferred state updates', () => {
  const cases = [
    { id: 'owner-name', value: 'New Owner', expected: 'New Owner', component: 'Input' },
    { id: 'owner-email', value: 'new@example.test', expected: 'new@example.test', component: 'Input' },
    { id: 'owner-phone', value: '0801234567', expected: '0801234567', component: 'Input' },
    { id: 'owner-theme', value: 'dark', expected: 'dark', component: 'select' },
    { id: 'owner-locale', value: 'en', expected: 'en', component: 'select' },
  ]

  for (const field of cases) {
    const page = loadPage(makeController(), [], true)

    let tree = page.runtime.render(page.Page)
    const control = find(tree, (node) => node.props?.id === field.id)
    const event = { currentTarget: { value: field.value } }
    control.props.onChange(event)
    event.currentTarget = null
    page.runtime.flushStateUpdates()
    tree = page.runtime.render(page.Page)

    const updatedControl = field.component === 'Input'
      ? byComponent(tree, page.ui, 'Input', (node) => node.props.id === field.id)
      : find(tree, (node) => node.type === 'select' && node.props.id === field.id)
    assert.equal(updatedControl.props.value, field.expected, `${field.id} should retain the event value`)
  }
})

test('Settings fields are disabled while their shared save request is pending', () => {
  const profilePage = loadPage(makeController({ isSavingProfile: true }))
  const profileTree = profilePage.runtime.render(profilePage.Page)
  for (const id of ['owner-name', 'owner-email', 'owner-phone']) {
    assert.equal(byComponent(profileTree, profilePage.ui, 'Input', (node) => node.props.id === id).props.disabled, true)
  }

  const preferencesPage = loadPage(makeController({ isSavingPreferences: true }))
  const preferencesTree = preferencesPage.runtime.render(preferencesPage.Page)
  for (const id of ['owner-theme', 'owner-locale']) {
    assert.equal(find(preferencesTree, (node) => node.type === 'select' && node.props.id === id).props.disabled, true)
  }
})

test('Header theme control uses the shared save method and applies the theme after success', async () => {
  const themeChanges = []
  const controller = makeController({ themeChanges })
  const toastCalls = []
  const toggle = loadThemeToggle({ controller, themeChanges, toastCalls })
  const tree = toggle.runtime.render(toggle.ThemeToggle)
  await byComponent(tree, toggle.ui, 'DropdownMenuItem', (node) => textContent(node) === 'Dark').props.onClick()

  assert.deepEqual(JSON.parse(JSON.stringify(controller.preferenceCalls[0])), { theme: 'dark' })
  assert.deepEqual(themeChanges, ['dark'])
  assert.equal(toastCalls.length, 0)
})
