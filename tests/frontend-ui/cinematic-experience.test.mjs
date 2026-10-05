import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import postcss from 'postcss'
import tailwind from '@tailwindcss/postcss'
import { createComponentLoader, React, renderToStaticMarkup } from './component-runtime.mjs'

const source = (path) => readFileSync(new URL(path, import.meta.url), 'utf8')
const css = source('../../app/globals.css')
const load = createComponentLoader()
const cinematic = load('components/ui/cinematic-motion.ts')
const plain = (value) => JSON.parse(JSON.stringify(value))

const routeClick = (overrides = {}) => ({
  button: 0,
  metaKey: false,
  ctrlKey: false,
  shiftKey: false,
  altKey: false,
  profile: 'desktop',
  viewTransitionSupported: true,
  currentOrigin: 'http://pms.local',
  targetOrigin: 'http://pms.local',
  targetPath: '/projects',
  targetSearch: '',
  currentPath: '/',
  currentSearch: '',
  linkTarget: null,
  hasDownload: false,
  ...overrides,
})

test('TC-34-01 motion profile separates reduced, touch, tablet and desktop', () => {
  const desktop = { reducedMotion: false, finePointer: true, hoverCapable: true, viewportWidth: 1280 }
  assert.equal(cinematic.resolveMotionProfile({ ...desktop, reducedMotion: true, viewportWidth: 390 }), 'reduced')
  assert.equal(cinematic.resolveMotionProfile({ ...desktop, viewportWidth: 639 }), 'touch')
  assert.equal(cinematic.resolveMotionProfile({ ...desktop, finePointer: false }), 'touch')
  assert.equal(cinematic.resolveMotionProfile({ ...desktop, hoverCapable: false, viewportWidth: 1400 }), 'touch')
  assert.equal(cinematic.resolveMotionProfile({ ...desktop, viewportWidth: Number.NaN }), 'touch')
  assert.equal(cinematic.resolveMotionProfile({ ...desktop, viewportWidth: 640 }), 'tablet')
  assert.equal(cinematic.resolveMotionProfile({ ...desktop, viewportWidth: 1023 }), 'tablet')
  assert.equal(cinematic.resolveMotionProfile(desktop), 'desktop')
  assert.equal(cinematic.resolveMotionProfile({ ...desktop, viewportWidth: 1024 }), 'desktop')
})

test('TC-34-02 effect budget keeps pointer, magnetic, blur and route transitions on desktop', () => {
  assert.deepEqual(plain(cinematic.effectBudget('desktop')), {
    pointer: true, magnetic: true, blur: true, choreography: true, routeTransition: true,
  })
  assert.deepEqual(plain(cinematic.effectBudget('tablet')), {
    pointer: false, magnetic: false, blur: false, choreography: true, routeTransition: false,
  })
  assert.equal(cinematic.effectBudget('touch').choreography, true)
  assert.equal(cinematic.effectBudget('touch').routeTransition, false)
  assert.deepEqual(plain(cinematic.effectBudget('reduced')), {
    pointer: false, magnetic: false, blur: false, choreography: false, routeTransition: false,
  })
  assert.equal(cinematic.motionFallback(true, 'desktop'), 'view-transition')
  assert.equal(cinematic.motionFallback(false, 'desktop'), 'css')
  assert.equal(cinematic.motionFallback(true, 'touch'), 'css')
  assert.equal(cinematic.motionFallback(true, 'reduced'), 'reduced')
})

test('TC-34-03 choreography delays are ordered and present in the stylesheet', () => {
  const delays = cinematic.CHOREOGRAPHY_DELAY_MS
  assert.deepEqual(plain(delays), { header: 0, primary: 40, support: 100, data: 170, actions: 230 })
  assert.ok(delays.header < delays.primary && delays.primary < delays.support)
  assert.ok(delays.support < delays.data && delays.data < delays.actions)
  for (const [beat, delay] of Object.entries(delays)) {
    assert.match(css, new RegExp(`var\\(--choreography-${beat}, ${delay}ms\\)`))
  }
  assert.equal(cinematic.choreographyDelay('data'), 170)
})

test('TC-34-04 pointer highlight stays inside the surface and falls back for invalid geometry', () => {
  const rect = { left: 100, top: 40, width: 200, height: 100 }
  assert.deepEqual(plain(cinematic.pointerHighlightPosition(150, 90, rect)), { x: 25, y: 50 })
  assert.deepEqual(plain(cinematic.pointerHighlightPosition(-20, 400, rect)), { x: 0, y: 100 })
  assert.deepEqual(plain(cinematic.pointerHighlightPosition(Number.NaN, 50, rect)), { x: 50, y: 40 })
  assert.deepEqual(plain(cinematic.pointerHighlightPosition(10, 10, { left: 0, top: 0, width: 0, height: 20 })), { x: 50, y: 40 })
  assert.equal(cinematic.formatHighlightUnit(50.126), '50.13%')
})

test('TC-34-05 magnetic offset is tiny, clamped and absent outside the control', () => {
  const rect = { left: 0, top: 0, width: 80, height: 40 }
  assert.deepEqual(plain(cinematic.magneticOffset(40, 20, rect)), { x: 0, y: 0 })
  assert.deepEqual(plain(cinematic.magneticOffset(400, 20, rect)), { x: 0, y: 0 })
  const near = cinematic.magneticOffset(50, 20, rect)
  assert.ok(near.x > 0 && near.x <= 4)
  assert.equal(near.y, 0)
  assert.deepEqual(plain(cinematic.magneticOffset(50, 20, rect, 0)), { x: 0, y: 0 })
  assert.deepEqual(plain(cinematic.magneticOffset(Number.NaN, 20, rect)), { x: 0, y: 0 })
  assert.equal(cinematic.formatMagneticUnit(-1.256), '-1.26px')
})

test('TC-34-06 metric direction and progress motion keep exact boundaries', () => {
  assert.equal(cinematic.metricDirection(2, 5), 'rise')
  assert.equal(cinematic.metricDirection(5, 2), 'fall')
  assert.equal(cinematic.metricDirection(4, 4), 'steady')
  assert.equal(cinematic.metricDirection(Number.NaN, 1), 'steady')
  assert.equal(cinematic.progressShiftPercent(0), 100)
  assert.equal(cinematic.progressShiftPercent(100), 0)
  assert.equal(cinematic.progressShiftPercent(78.5), 21.5)
  assert.equal(cinematic.progressShiftPercent(-10), 100)
  assert.equal(cinematic.progressShiftPercent(140), 0)
  assert.equal(cinematic.progressShiftPercent(Number.NaN), 100)
})

test('TC-34-07 primary KPI and primary actions are the only magnetic or focal markers', () => {
  assert.equal(cinematic.kpiMarker('primary'), 'kpi-primary')
  assert.equal(cinematic.kpiMarker('support'), 'kpi')
  assert.equal(cinematic.kpiMarker(undefined), 'kpi')
  assert.equal(cinematic.magneticControlKind(true), 'magnetic')
  assert.equal(cinematic.magneticControlKind(false), undefined)
  assert.equal(cinematic.magneticControlKind(undefined), undefined)
  assert.equal(cinematic.magneticControlKind(null), undefined)
})

test('TC-34-08 route transitions run only for plain desktop navigations to another same-origin URL', () => {
  assert.equal(cinematic.shouldStartRouteTransition(routeClick()), true)
  assert.equal(cinematic.shouldStartRouteTransition(routeClick({ targetSearch: '?year=2026' })), true)
  const blocked = [
    { profile: 'reduced' },
    { profile: 'touch' },
    { profile: 'tablet' },
    { viewTransitionSupported: false },
    { button: 1 },
    { metaKey: true },
    { ctrlKey: true },
    { shiftKey: true },
    { altKey: true },
    { hasDownload: true },
    { linkTarget: '_blank' },
    { targetOrigin: 'https://gitlab.example' },
    { targetOrigin: null },
    { targetPath: null },
    { targetPath: '/', targetSearch: '' },
    { targetPath: '/', targetSearch: '?same=1', currentPath: '/', currentSearch: '?same=1' },
  ]
  for (const overrides of blocked) {
    assert.equal(cinematic.shouldStartRouteTransition(routeClick(overrides)), false, JSON.stringify(overrides))
  }
  assert.equal(cinematic.shouldStartRouteTransition(routeClick({ linkTarget: '_self' })), true)
})

test('TC-34-09 pointer frames coalesce, ignore disabled targets and release on reset', () => {
  const frames = []
  const cancelled = []
  const rects = new Map()
  const controller = cinematic.createPointerController(
    (flush) => {
      frames.push(flush)
      return frames.length
    },
    (id) => { cancelled.push(id) },
    (target) => rects.get(target) ?? null,
  )
  const calls = []
  const card = {
    mode: 'pointer',
    disabled: () => false,
    setPointer: (x, y) => calls.push(['pointer', x, y]),
    setMagnetic: (x, y) => calls.push(['magnetic', x, y]),
    clear: () => calls.push(['clear']),
  }
  rects.set(card, { left: 0, top: 0, width: 100, height: 100 })
  controller.push({ clientX: 10, clientY: 10, target: card })
  controller.push({ clientX: 25, clientY: 50, target: card })
  assert.equal(frames.length, 1)
  frames[0]()
  assert.deepEqual(calls.at(-1), ['pointer', 25, 50])

  const button = {
    mode: 'magnetic',
    disabled: () => false,
    setPointer: () => calls.push(['pointer-button']),
    setMagnetic: (x, y) => calls.push(['magnetic', x, y]),
    clear: () => calls.push(['clear']),
  }
  rects.set(button, { left: 0, top: 0, width: 80, height: 40 })
  controller.push({ clientX: 50, clientY: 20, target: button })
  frames[1]()
  assert.deepEqual(calls.at(-2), ['clear'])
  assert.equal(calls.at(-1)[0], 'magnetic')
  controller.releaseMagnetic()
  assert.deepEqual(calls.at(-1), ['magnetic', 0, 0])

  const disabled = { ...card, disabled: () => true, clear: () => calls.push(['disabled-clear']) }
  controller.push({ clientX: 1, clientY: 1, target: disabled })
  frames[2]()
  assert.deepEqual(calls.at(-1), ['disabled-clear'])
  controller.push({ clientX: 1, clientY: 1, target: card })
  controller.reset()
  assert.deepEqual(cancelled, [4])
  assert.equal(frames.length, 4)
})

test('TC-34-10 route session accepts one transition, settles it and recovers from an unavailable API', async () => {
  let resolveFinished
  const finished = new Promise((resolve) => { resolveFinished = resolve })
  let armedFinish
  let stops = 0
  let settled = 0
  const session = cinematic.createRouteTransitionSession((update) => {
    update()
    return { finished }
  })
  assert.equal(session.begin((finish) => {
    armedFinish = finish
    return () => { stops += 1 }
  }, () => { settled += 1 }), true)
  assert.equal(session.isPending(), true)
  assert.equal(session.begin(() => () => {}, () => {}), false)
  armedFinish()
  assert.equal(stops, 1)
  resolveFinished()
  await finished
  assert.equal(settled, 1)
  assert.equal(session.isPending(), false)

  const unavailable = cinematic.createRouteTransitionSession(() => {
    throw new Error('View Transition API is unavailable')
  })
  assert.equal(unavailable.begin(() => () => {}, () => {}), false)
  assert.equal(unavailable.isPending(), false)
})

test('TC-34-11 the route shell keeps the existing entrance contract and mounts one runtime', () => {
  const Template = load('app/template.tsx').default
  const html = renderToStaticMarkup(React.createElement(Template, null, React.createElement('main', null, 'Dashboard')))
  assert.match(html, /data-cinematic="route"/)
  assert.match(html, /class="motion-page-enter min-h-svh"/)
  assert.match(source('../../app/layout.tsx'), /<CinematicRuntime \/>/)
  assert.match(source('../../components/layout/page-layout.ts'), /cinematic-settle/)
  assert.match(source('../../components/layout/page-layout.ts'), /PAGE_INNER\s*=\s*'min-w-0/)
})

test('TC-34-12 Dashboard gives the first KPI focal weight and moves progress with transform', () => {
  const { SummaryStatCard } = load('components/layout/summary-stat-card.tsx')
  const primary = renderToStaticMarkup(React.createElement(SummaryStatCard, {
    emphasis: 'primary', interactive: true, label: 'Work Items ทั้งหมด', value: 8,
  }))
  const support = renderToStaticMarkup(React.createElement(SummaryStatCard, { label: 'Open', value: 2 }))
  assert.match(primary, /data-cinematic="kpi-primary"/)
  assert.match(primary, /data-spatial="pointer"/)
  assert.match(primary, /motion-card/)
  assert.match(primary, /class="motion-value-change"/)
  assert.match(support, /data-cinematic="kpi"/)
  assert.doesNotMatch(support, /data-spatial|motion-card|cinematic-pointer/)
  const dashboard = source('../../app/page.tsx')
  assert.match(dashboard, /emphasis="primary"/)
  assert.match(dashboard, /interactive/)
  assert.doesNotMatch(source('../../app/analysis/page.tsx'), /interactive/)
  assert.doesNotMatch(source('../../app/projects/[id]/page.tsx'), /interactive/)
  assert.match(dashboard, /progressShiftPercent\(project\.progress\)/)
  assert.match(dashboard, /motion-progress-indicator/)
  assert.doesNotMatch(dashboard, /style=\{\{ width:/)
})

test('TC-34-13 signature surfaces use shared continuity, pointer cards and feedback edges', () => {
  assert.match(source('../../components/layout/app-sidebar.tsx'), /data-shared-element="workspace"/)
  assert.match(source('../../components/layout/app-sidebar.tsx'), /data-spatial="magnetic"/)
  assert.match(source('../../components/layout/app-header.tsx'), /cinematic-topbar/)
  assert.match(source('../../components/page/projects/project-card.tsx'), /data-shared-element="project"/)
  assert.match(source('../../components/page/projects/project-card.tsx'), /data-shared-id=\{project\.id\}/)
  assert.match(source('../../app/projects/[id]/page.tsx'), /id="project-detail-heading"/)
  assert.match(source('../../app/projects/[id]/page.tsx'), /data-shared-id=\{id\}/)
  assert.match(source('../../components/page/projects/project-card.tsx'), /data-spatial="pointer"/)
  assert.match(source('../../components/page/work-items/work-item-card.tsx'), /cinematic-pointer/)
  assert.match(source('../../components/ui/dialog.tsx'), /cinematic-overlay/)
  assert.match(source('../../components/ui/dialog.tsx'), /cinematic-modal/)
  assert.match(source('../../components/ui/alert-dialog.tsx'), /cinematic-overlay/)
  assert.match(source('../../components/ui/sheet.tsx'), /cinematic-sheet/)
  assert.match(source('../../components/ui/sheet.tsx'), /cinematic-overlay/)
  assert.match(source('../../components/ui/toast.tsx'), /data-variant=\{variant \?\? 'default'\}/)
  assert.match(source('../../components/ui/chart.tsx'), /cinematic-chart/)
  for (const name of Object.values(cinematic.SHARED_ELEMENT)) assert.match(css, new RegExp(name))
})

test('TC-34-14 cinematic keyframes stay on compositor properties and reduced motion disables them', async () => {
  const compiled = postcss.parse((await postcss([tailwind()]).process(css, { from: 'app/globals.css' })).css)
  const routeFrames = []
  compiled.walkAtRules('keyframes', (rule) => {
    if (rule.params === 'pms-cinematic-route' || rule.params === 'pms-content-enter') routeFrames.push(rule)
  })
  assert.equal(routeFrames.length, 2)
  for (const frame of routeFrames) {
    frame.walkDecls((declaration) => assert.ok(['opacity', 'transform'].includes(declaration.prop), declaration.prop))
  }
  const reduced = []
  compiled.walkAtRules('media', (rule) => {
    if (rule.params.includes('prefers-reduced-motion: reduce')) reduced.push(rule.toString())
  })
  assert.ok(reduced.some((rule) => rule.includes('.cinematic-chart') && rule.includes('animation: none')))
  assert.ok(reduced.some((rule) => rule.includes('[data-spatial=\'magnetic\']') || rule.includes('[data-spatial="magnetic"]')))
  assert.match(css, /@supports \(\(backdrop-filter: blur\(8px\)\) or \(-webkit-backdrop-filter: blur\(8px\)\)\)/)
  assert.match(css, /html\[data-motion-profile='desktop'\] \[data-spatial='magnetic'\]/)
  assert.match(css, /\[data-spatial='magnetic'\]\s*\{[^}]*transition-property:\s*color, background-color, border-color, box-shadow, transform, translate/)
  assert.doesNotMatch(css, /\[data-spatial='magnetic'\]\s*\{[^}]*transition:\s*transform/)
  assert.match(css, /html\[data-motion-profile='touch'\] \.motion-stagger > :nth-child\(n\)/)
})

test('TC-34-15 magnetic behavior is opt-in for high-value actions', () => {
  const { Button } = load('components/ui/button.tsx')
  const primary = renderToStaticMarkup(React.createElement(Button, { magnetic: true }, 'ใช้ตัวกรอง'))
  const success = renderToStaticMarkup(React.createElement(Button, { variant: 'success' }, 'ส่งออก'))
  const ghost = renderToStaticMarkup(React.createElement(Button, { variant: 'ghost' }, 'โปรไฟล์'))
  assert.match(primary, /data-slot="button"/)
  assert.match(primary, /data-spatial="magnetic"/)
  assert.doesNotMatch(success, /data-spatial/)
  assert.doesNotMatch(ghost, /data-spatial/)
  assert.match(primary, /focus-visible:ring/)
  assert.match(source('../../app/work-items/page.tsx'), /<Button magnetic onClick=\{openCreate\}>/)
  assert.match(source('../../app/projects/page.tsx'), /<Button magnetic /)
  assert.doesNotMatch(source('../../components/ui/button.tsx'), /data-spatial=\{magneticControlKind\(variant\)\}/)
})

test('TC-34-16 the runtime removes every listener and does not render a node', () => {
  const runtime = source('../../components/layout/cinematic-runtime.tsx')
  assert.match(runtime, /return null/)
  assert.match(runtime, /removeEventListener\('pointermove', onPointer\)/)
  assert.match(runtime, /removeEventListener\('pointerdown', onPressure, true\)/)
  assert.match(runtime, /removeEventListener\('click', onClick, true\)/)
  assert.match(runtime, /removeEventListener\('popstate', onPopState\)/)
  assert.match(runtime, /query\.removeEventListener\('change', syncProfile\)/)
  assert.match(runtime, /pointer\.reset\(\)/)
  assert.match(runtime, /finishRoute\(\)/)
  assert.doesNotMatch(runtime, /useSearchParams/)
})

test('TC-34-17 shared element names and blur stay behind desktop and reduced-motion guards', () => {
  assert.match(css, /@supports \(view-transition-name: none\)/)
  assert.match(css, /html\[data-motion-profile='desktop'\] \[data-shared-element='workspace'\]/)
  assert.match(css, /view-transition-name: var\(--shared-navigation, pms-nav-indicator\)/)
  assert.match(css, /view-transition-name: var\(--shared-heading, pms-page-heading\)/)
  assert.match(css, /view-transition-name: var\(--shared-project, pms-project\)/)
  assert.match(css, /::view-transition-group\(\*\)/)
  assert.match(css, /prefers-reduced-motion: reduce\)[\s\S]*\.cinematic-overlay \{[^}]*backdrop-filter: none/)
  assert.match(css, /\.special-dark body/)
  assert.equal(cinematic.SPATIAL_LEVEL.modal, 6)
  assert.equal(cinematic.SPATIAL_LEVEL.background, 0)
})

test('TC-34-18 cinematic unit cases have a reusable suite command and tree reporter', () => {
  const packageJson = JSON.parse(source('../../package.json'))
  const runner = source('../../tests/run.mjs')
  const testingGuide = source('../../document/process/testing.md')
  assert.equal(packageJson.scripts['test:frontend-cinematic'], 'node tests/run.mjs frontend-cinematic')
  assert.match(runner, /"frontend-cinematic": \{ files: \[join\(testRoot, "frontend-ui", "cinematic-experience\.test\.mjs"\)\] \}/)
  assert.match(testingGuide, /pnpm test:frontend-cinematic[\s\S]*bash scripts\/test-unit\.sh frontend-cinematic/)
})

const PROJECT_ID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee'

test('TC-34-19 review contracts keep entrances from replaying and leave static cards calm', () => {
  assert.equal(cinematic.ROUTE_TRANSITION_TIMEOUT_MS, 240)
  assert.equal(cinematic.scrollDepth(0), 'rest')
  assert.equal(cinematic.scrollDepth(12), 'rest')
  assert.equal(cinematic.scrollDepth(13), 'raised')
  assert.equal(cinematic.scrollDepth(Number.NaN), 'rest')
  assert.equal(cinematic.sharedProjectId(PROJECT_ID), PROJECT_ID)
  assert.equal(cinematic.sharedProjectId('AAAAAAAA-BBBB-4CCC-8DDD-EEEEEEEEEEEE'), PROJECT_ID)
  assert.equal(cinematic.sharedProjectId('project-1'), null)
  assert.equal(cinematic.activateSharedProjectHeading(PROJECT_ID, PROJECT_ID.toUpperCase()), true)
  assert.equal(cinematic.activateSharedProjectHeading(PROJECT_ID, 'project-1'), false)
  const properties = {}
  cinematic.applyCinematicTokens((name, value) => { properties[name] = value })
  assert.equal(properties['--choreography-data'], '170ms')
  assert.equal(properties['--choreography-actions'], '230ms')
  assert.equal(properties['--spatial-level-modal'], '6')
  assert.equal(properties['--spatial-level-overlay'], '5')
  assert.equal(properties['--shared-project'], cinematic.SHARED_ELEMENT.project)
  const held = { style: { setProperty(name, value) { this[name] = value } } }
  cinematic.holdEntranceMotion(held)
  assert.equal(held.style.animation, 'none')
  const runtime = source('../../components/layout/cinematic-runtime.tsx')
  assert.doesNotMatch(runtime, /cinematicArrived/)
  assert.match(runtime, /ROUTE_TRANSITION_TIMEOUT_MS/)
  assert.match(runtime, /holdEntrances/)
  assert.doesNotMatch(css, /data-cinematic-arrived/)
  assert.doesNotMatch(css, /data-route-transition='settled'/)
  assert.doesNotMatch(css, /\.cinematic-topbar\s*\{[^}]*animation/)
  assert.match(css, /html\[data-scroll-depth='raised'\] \.cinematic-topbar/)
  assert.match(css, /\[data-metric-direction='rise'\]/)
  assert.match(css, /\[data-metric-direction='fall'\]\.motion-value-change/)
  assert.match(css, /@keyframes pms-value-fall/)
  assert.match(css, /html:has\(\.cinematic-overlay\[data-state='open'\]\) \.cinematic-topbar/)
  assert.match(source('../../app/loading.tsx'), /DashboardLoading/)
  for (const path of ['app/board/page.tsx', 'app/analysis/page.tsx', 'app/settings/page.tsx', 'app/daily-work/page.tsx', 'app/company/page.tsx', 'app/work-items/page.tsx']) {
    assert.match(source(`../../${path}`), /cinematic-beat-/, path)
  }
})

function mountCinematicRuntime() {
  class Element {}
  class HTMLElement extends Element {
    constructor() {
      super()
      this.dataset = {}
      this.inline = {}
      this.style = { setProperty: (name, value) => { this.inline[name] = value } }
      this.isConnected = true
    }

    matches(selector) {
      if (selector === 'a[href]') return this instanceof HTMLAnchorElement
      return false
    }
  }
  class HTMLAnchorElement extends HTMLElement {
    getAttribute() { return null }
    hasAttribute() { return false }
  }
  Element.prototype.closest = function closest(selector) {
    if (this.matches?.(selector)) return this
    return this.parentElement?.closest(selector) ?? null
  }
  const listeners = []
  const frames = new Map()
  const timers = new Map()
  const observers = []
  let sequence = 1
  const media = { reduced: false, fine: true, hover: true }
  const queries = []
  const location = { origin: 'http://pms.local', pathname: '/', search: '', href: 'http://pms.local/' }
  const root = {
    dataset: {},
    style: { props: {}, setProperty(name, value) { this.props[name] = value } },
  }
  const entrance = new HTMLElement()
  const heading = new HTMLElement()
  let anchor = new HTMLAnchorElement()
  const documentListeners = []
  let transitions = 0
  const document = {
    documentElement: root,
    body: {},
    startViewTransition(update) {
      transitions += 1
      const pending = update()
      return { finished: pending.then(() => undefined) }
    },
    addEventListener(type, fn, options) { documentListeners.push({ type, fn, options }) },
    removeEventListener(type, fn) {
      const index = documentListeners.findIndex((entry) => entry.type === type && entry.fn === fn)
      if (index >= 0) documentListeners.splice(index, 1)
    },
    getElementById(id) { return id === 'project-detail-heading' ? heading : null },
    querySelectorAll(selector) {
      if (selector === cinematic.ENTRANCE_SELECTOR) return [entrance]
      if (selector === '[data-shared-active="project"]') return [anchor, heading].filter((node) => node.dataset.sharedActive === 'project')
      return []
    },
  }
  const view = {
    get innerWidth() { return media.width ?? 1280 },
    set innerWidth(value) { media.width = value },
    document,
    location,
    matchMedia(query) {
      const list = {
        get matches() {
          if (query.includes('prefers-reduced-motion')) return media.reduced
          if (query.includes('pointer: fine')) return media.fine
          if (query.includes('hover: hover')) return media.hover
          return false
        },
        addEventListener(_type, fn) { list.listener = fn },
        removeEventListener(_type, fn) { if (list.listener === fn) list.listener = null },
        emit() { list.listener?.() },
      }
      queries.push(list)
      return list
    },
    addEventListener(type, fn, options) { listeners.push({ type, fn, options }) },
    removeEventListener(type, fn) {
      const index = listeners.findIndex((entry) => entry.type === type && entry.fn === fn)
      if (index >= 0) listeners.splice(index, 1)
    },
    requestAnimationFrame(fn) {
      const id = sequence++
      frames.set(id, fn)
      return id
    },
    cancelAnimationFrame(id) { frames.delete(id) },
    setTimeout(fn, ms) {
      const id = sequence++
      timers.set(id, { fn, ms })
      return id
    },
    clearTimeout(id) { timers.delete(id) },
    emit(type, event) {
      for (const entry of [...listeners]) if (entry.type === type) entry.fn(event)
    },
  }
  let effect
  const runtimeLoad = createComponentLoader({
    react: { ...React, useEffect(callback) { effect = callback } },
  }, { window: view, document, Element, HTMLElement, HTMLAnchorElement, WeakMap, MutationObserver: class {
    constructor(callback) {
      this.callback = callback
      observers.push(this)
    }
    observe() {}
    disconnect() { this.disconnected = true }
  } })
  runtimeLoad('components/layout/cinematic-runtime.tsx').CinematicRuntime()
  const cleanup = effect()
  const click = (href, dataset = {}, event = {}) => {
    anchor = new HTMLAnchorElement()
    anchor.href = href
    anchor.dataset = { ...dataset }
    view.emit('click', { target: anchor, button: 0, metaKey: false, ctrlKey: false, shiftKey: false, altKey: false, defaultPrevented: true, view, ...event })
    return anchor
  }
  return { view, document, root, entrance, heading, listeners, documentListeners, frames, timers, observers, queries, media, location, cleanup, click, get transitions() { return transitions } }
}

async function flushTransition(harness) {
  for (const callback of [...harness.frames.values()]) callback()
  harness.frames.clear()
  await Promise.resolve()
  await Promise.resolve()
}

test('TC-34-20 runtime settles a view transition once, releases listeners and does not replay entrances', async () => {
  const harness = mountCinematicRuntime()
  assert.equal(harness.root.dataset.motionProfile, 'desktop')
  assert.equal(harness.root.style.props['--choreography-data'], '170ms')
  assert.equal(harness.root.style.props['--spatial-level-overlay'], '5')
  assert.ok(harness.listeners.some((entry) => entry.type === 'pointermove'))
  const anchor = harness.click(`http://pms.local/projects/${PROJECT_ID}`, { sharedElement: 'project', sharedId: PROJECT_ID })
  assert.equal(harness.transitions, 1)
  assert.equal(harness.root.dataset.routeTransition, 'view')
  assert.equal(harness.root.dataset.cinematicArrived, undefined)
  assert.equal(anchor.dataset.sharedActive, 'project')
  assert.equal(harness.root.dataset.sharedProject, PROJECT_ID)
  harness.click('http://pms.local/board')
  assert.equal(harness.transitions, 1)
  harness.heading.dataset.sharedId = PROJECT_ID
  harness.location.pathname = `/projects/${PROJECT_ID}`
  harness.observers.at(-1).callback()
  assert.equal(harness.heading.dataset.sharedActive, 'project')
  assert.equal(harness.root.dataset.routeTransition, 'view')
  await flushTransition(harness)
  assert.equal(harness.root.dataset.routeTransition, undefined)
  assert.equal(harness.root.dataset.cinematicArrived, undefined)
  assert.equal(harness.root.dataset.sharedProject, undefined)
  assert.equal(harness.heading.dataset.sharedActive, undefined)
  assert.equal(harness.entrance.inline.animation, 'none')
  assert.equal(harness.timers.size, 0)
  harness.cleanup()
})

test('TC-34-21 a stalled navigation, popstate and profile change cannot leave transition state or pointer listeners behind', async () => {
  const stalled = mountCinematicRuntime()
  stalled.click('http://pms.local/projects/not-a-uuid', { sharedElement: 'project', sharedId: 'project-1' })
  assert.equal(stalled.root.dataset.sharedProject, undefined)
  assert.equal(stalled.transitions, 1)
  const timer = [...stalled.timers.values()][0]
  assert.equal(timer.ms, 240)
  timer.fn()
  await flushTransition(stalled)
  assert.equal(stalled.root.dataset.routeTransition, undefined)
  assert.equal(stalled.entrance.inline.animation, 'none')
  stalled.cleanup()

  const popped = mountCinematicRuntime()
  popped.click('http://pms.local/analysis')
  popped.view.emit('popstate')
  await flushTransition(popped)
  assert.equal(popped.root.dataset.routeTransition, undefined)
  assert.equal(popped.entrance.inline.animation, 'none')
  popped.cleanup()

  const adapted = mountCinematicRuntime()
  assert.ok(adapted.listeners.some((entry) => entry.type === 'pointermove'))
  adapted.view.innerWidth = 390
  adapted.view.emit('resize')
  assert.equal(adapted.root.dataset.motionProfile, 'touch')
  assert.equal(adapted.listeners.some((entry) => entry.type === 'pointermove'), false)
  const main = new (adapted.entrance.constructor)()
  main.tagName = 'MAIN'
  main.scrollTop = 40
  adapted.documentListeners.find((entry) => entry.type === 'scroll').fn({ target: main })
  assert.equal(adapted.root.dataset.scrollDepth, 'raised')
  main.scrollTop = 0
  adapted.documentListeners.find((entry) => entry.type === 'scroll').fn({ target: main })
  assert.equal(adapted.root.dataset.scrollDepth, 'rest')
  adapted.documentListeners.find((entry) => entry.type === 'scroll').fn({ target: adapted.entrance })
  assert.equal(adapted.root.dataset.scrollDepth, 'rest')
  adapted.cleanup()
  assert.equal(adapted.listeners.some((entry) => entry.type === 'click'), false)
  assert.equal(adapted.documentListeners.some((entry) => entry.type === 'scroll'), false)
})
