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

test('TC-34-02 effect budget keeps spatial feedback on desktop', () => {
  assert.deepEqual(plain(cinematic.effectBudget('desktop')), {
    pointer: true, magnetic: true, blur: false,
  })
  assert.deepEqual(plain(cinematic.effectBudget('tablet')), {
    pointer: false, magnetic: false, blur: false,
  })
  assert.deepEqual(plain(cinematic.effectBudget('reduced')), {
    pointer: false, magnetic: false, blur: false,
  })

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
})

test('TC-34-14 cinematic keyframes stay on compositor properties and reduced motion disables them', async () => {
  const compiled = postcss.parse((await postcss([tailwind()]).process(css, { from: 'app/globals.css' })).css)
  const routeFrames = []
  compiled.walkAtRules('keyframes', (rule) => {
    if (rule.params === 'pms-page-enter') routeFrames.push(rule)
  })
  assert.equal(routeFrames.length, 1)
  for (const frame of routeFrames) {
    frame.walkDecls((declaration) => assert.ok(['opacity', 'transform'].includes(declaration.prop), declaration.prop))
  }
  const reduced = []
  compiled.walkAtRules('media', (rule) => {
    if (rule.params.includes('prefers-reduced-motion: reduce')) reduced.push(rule.toString())
  })
  assert.ok(reduced.some((rule) => rule.includes('.cinematic-chart') && rule.includes('animation: none')))
  assert.ok(reduced.some((rule) => rule.includes('[data-spatial=\'magnetic\']') || rule.includes('[data-spatial="magnetic"]')))
  assert.doesNotMatch(css, /backdrop-filter: blur/)
  assert.match(css, /html\[data-motion-profile='desktop'\] \[data-spatial='magnetic'\]/)
  assert.match(css, /\[data-spatial='magnetic'\]\s*\{[^}]*transition-property:\s*color, background-color, border-color, box-shadow, transform, translate/)
  assert.doesNotMatch(css, /\[data-spatial='magnetic'\]\s*\{[^}]*transition:\s*transform/)
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
  assert.match(runtime, /query\.removeEventListener\('change', syncProfile\)/)
  assert.match(runtime, /pointer\.reset\(\)/)
  assert.doesNotMatch(runtime, /useSearchParams|startViewTransition|MutationObserver|holdEntrances/)
})

test('TC-34-17 route snapshots and backdrop blur cannot repaint the shell', () => {
  assert.doesNotMatch(css, /view-transition-name|::view-transition/)
  assert.match(css, /\.cinematic-overlay\s*\{[^}]*backdrop-filter: none/)
  assert.doesNotMatch(css, /html:has\(\.cinematic-overlay/)
  assert.match(css, /\.special-dark body/)
})

test('TC-34-18 cinematic unit cases have a reusable suite command and tree reporter', () => {
  const packageJson = JSON.parse(source('../../package.json'))
  const runner = source('../../tests/run.mjs')
  const testingGuide = source('../../document/development/testing.md')
  assert.equal(packageJson.scripts['test:frontend-cinematic'], 'node tests/run.mjs frontend-cinematic')
  assert.match(runner, /"frontend-cinematic": \{ files: \[join\(testRoot, "frontend-ui", "cinematic-experience\.test\.mjs"\)\] \}/)
  assert.match(testingGuide, /pnpm test:frontend-cinematic[\s\S]*bash scripts\/test-unit\.sh frontend-cinematic/)
})

test('TC-34-19 scroll elevation keeps exact boundaries', () => {
  assert.equal(cinematic.scrollDepth(0), 'rest')
  assert.equal(cinematic.scrollDepth(12), 'rest')
  assert.equal(cinematic.scrollDepth(13), 'raised')
  assert.equal(cinematic.scrollDepth(Number.NaN), 'rest')
})

function mountCinematicRuntime() {
  class Element {}
  class HTMLElement extends Element {}
  const listeners = new Map()
  const documentListeners = new Map()
  const queries = []
  const media = { reduced: false, width: 1280 }
  const document = {
    documentElement: { dataset: {} },
    startViewTransition() { throw new Error('Navigation must not pause painting') },
    addEventListener(type, fn) { documentListeners.set(type, fn) },
    removeEventListener(type, fn) { if (documentListeners.get(type) === fn) documentListeners.delete(type) },
  }
  const view = {
    get innerWidth() { return media.width },
    matchMedia(query) {
      const list = {
        get matches() { return query.includes('prefers-reduced-motion') ? media.reduced : true },
        addEventListener(_type, fn) { list.listener = fn },
        removeEventListener(_type, fn) { if (list.listener === fn) list.listener = null },
      }
      queries.push(list)
      return list
    },
    addEventListener(type, fn) { listeners.set(type, fn) },
    removeEventListener(type, fn) { if (listeners.get(type) === fn) listeners.delete(type) },
  }
  let effect
  const runtimeLoad = createComponentLoader({
    react: { ...React, useEffect(callback) { effect = callback } },
  }, { window: view, document, Element, HTMLElement, WeakMap })
  assert.equal(runtimeLoad('components/layout/cinematic-runtime.tsx').CinematicRuntime(), null)
  const cleanup = effect()
  return { view, root: document.documentElement, listeners, documentListeners, queries, media, cleanup, HTMLElement }
}

test('TC-34-20 runtime leaves navigation alone and releases all subscriptions on unmount', () => {
  const harness = mountCinematicRuntime()
  assert.equal(harness.root.dataset.motionProfile, 'desktop')
  assert.equal(harness.listeners.has('pointermove'), true)
  assert.equal(harness.listeners.has('click'), false)
  assert.equal(harness.listeners.has('popstate'), false)
  harness.cleanup()
  assert.equal(harness.listeners.size, 0)
  assert.equal(harness.documentListeners.size, 0)
  assert.ok(harness.queries.every((query) => !query.listener))
})

test('TC-34-21 pointer feedback adapts to touch and reduced motion while scroll depth stays responsive', () => {
  const harness = mountCinematicRuntime()
  harness.media.width = 390
  harness.listeners.get('resize')()
  assert.equal(harness.root.dataset.motionProfile, 'touch')
  assert.equal(harness.listeners.has('pointermove'), false)
  harness.media.width = 1280
  harness.listeners.get('resize')()
  assert.equal(harness.listeners.has('pointermove'), true)
  harness.media.reduced = true
  harness.queries[0].listener()
  assert.equal(harness.root.dataset.motionProfile, 'reduced')
  assert.equal(harness.listeners.has('pointermove'), false)
  const main = new harness.HTMLElement()
  main.tagName = 'MAIN'
  main.scrollTop = 40
  const scroll = harness.documentListeners.get('scroll')
  scroll({ target: main })
  assert.equal(harness.root.dataset.scrollDepth, 'raised')
  main.scrollTop = 0
  scroll({ target: main })
  assert.equal(harness.root.dataset.scrollDepth, 'rest')
  scroll({ target: {} })
  assert.equal(harness.root.dataset.scrollDepth, 'rest')
  harness.cleanup()
})
