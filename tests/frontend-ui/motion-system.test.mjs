import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import postcss from 'postcss'
import tailwind from '@tailwindcss/postcss'
import { createComponentLoader, descendants, Link, React, renderToStaticMarkup } from './component-runtime.mjs'

const source = (path) => readFileSync(new URL(path, import.meta.url), 'utf8')
const css = source('../../app/globals.css')
const load = createComponentLoader()
const { MOTION_CLASS, MOTION_DURATION_MS, MOTION_EASING } = load('components/ui/motion.ts')

async function compileStyles() {
  const result = await postcss([tailwind()]).process(css, { from: 'app/globals.css' })
  return postcss.parse(result.css)
}

const compiledStyles = compileStyles()

function matchingRules(styles, selector) {
  const matches = []
  styles.walkRules((rule) => {
    if (rule.selector.includes(selector)) matches.push(rule)
  })
  return matches
}

function isLayered(rule) {
  let parent = rule.parent
  while (parent) {
    if (parent.type === 'atrule' && parent.name === 'layer') return true
    parent = parent.parent
  }
  return false
}

function declaration(rule, property) {
  let value
  rule.walkDecls(property, (entry) => { value = entry.value })
  return value
}

test('TC-28-01 shared duration and easing tokens match the CSS design system', () => {
  const durationVariables = {
    instant: 'motion-instant',
    fast: 'motion-fast',
    standard: 'motion-standard',
    slow: 'motion-slow',
    page: 'motion-page',
    overlay: 'motion-overlay',
    chart: 'motion-data',
    skeleton: 'motion-skeleton',
    staggerStep: 'motion-stagger-step',
  }
  for (const [key, variable] of Object.entries(durationVariables)) {
    assert.match(css, new RegExp(`--${variable}:\\s*${MOTION_DURATION_MS[key]}ms`), variable)
  }
  for (const [key, easing] of Object.entries(MOTION_EASING)) {
    assert.ok(css.includes(`--ease-${key}: ${easing}`), key)
  }
  assert.deepEqual(Object.keys(MOTION_CLASS), ['pageEnter', 'contentEnter', 'valueChange', 'stagger', 'control', 'card'])
})

test('TC-28-02 App Router template gives each new route a short page entrance', () => {
  const Template = load('app/template.tsx').default
  const html = renderToStaticMarkup(React.createElement(Template, null,
    React.createElement('main', null, 'Dashboard')))
  assert.match(html, /class="motion-page-enter min-h-svh"/)
  assert.match(html, /<main>Dashboard<\/main>/)
  assert.match(source('../../app/template.tsx'), /App Router remounts templates between routes/)
})

test('TC-28-03 entrance choreography animates compositor properties and is disabled for reduced motion', async () => {
  const styles = await compiledStyles
  const pageFrames = []
  styles.walkAtRules('keyframes', (rule) => {
    if (rule.params === 'pms-page-enter' || rule.params === 'pms-content-enter') pageFrames.push(rule)
  })
  assert.equal(pageFrames.length, 2)
  for (const frame of pageFrames) {
    frame.walkDecls((declaration) => assert.ok(['opacity', 'transform'].includes(declaration.prop), declaration.prop))
  }
  const reducedMotion = []
  styles.walkAtRules('media', (rule) => {
    if (rule.params.includes('prefers-reduced-motion: reduce')) reducedMotion.push(rule.toString())
  })
  assert.ok(reducedMotion.some((rule) => rule.includes('.motion-page-enter') && rule.includes('animation: none')))
  assert.ok(reducedMotion.some((rule) => rule.includes('.motion-card') && rule.includes('transition: none')))
})

test('TC-28-04 persistent navigation indicator centers and clamps at its route target', () => {
  const { getSharedNavigationIndicatorOffset } = load('components/layout/navigation-motion.ts')
  assert.equal(getSharedNavigationIndicatorOffset(100, 144, 44), 55)
  assert.equal(getSharedNavigationIndicatorOffset(120, 100, 12), 0)
  assert.equal(getSharedNavigationIndicatorOffset(0, 72.5, 43, 21), 83.5)
  assert.match(source('../../components/layout/shared-navigation-indicator.tsx'), /data-slot="shared-navigation-indicator"/)
  assert.match(css, /\.motion-shared-nav-indicator\s*\{[^}]*transform:\s*translate3d/s)
})

test('TC-28-05 application fallback is an accessible shell-shaped skeleton', () => {
  const { ApplicationLoadingShell } = load('components/layout/application-loading-shell.tsx')
  const html = renderToStaticMarkup(React.createElement(ApplicationLoadingShell))
  assert.match(html, /role="status" aria-busy="true"/)
  assert.match(html, /กำลังโหลดหน้าที่เลือก/)
  assert.match(html, /<aside[^>]*aria-hidden="true"/)
  assert.match(html, /data-slot="skeleton"/)
  assert.doesNotMatch(html, />Loading\.\.\.</)
})

test('TC-28-06 metric changes and progress values use short, transform-based feedback', () => {
  const { SummaryStatCard } = load('components/layout/summary-stat-card.tsx')
  const { Progress } = load('components/ui/progress.tsx')
  const metric = renderToStaticMarkup(React.createElement(SummaryStatCard, { label: 'Open', value: 8 }))
  const progress = renderToStaticMarkup(React.createElement(Progress, { value: 78, 'aria-label': 'Project progress' }))
  assert.match(metric, /data-slot="animated-stat-value" class="motion-value-change"/)
  assert.match(metric, /<span aria-hidden="true">8<\/span><span class="sr-only">8<\/span>/)
  assert.match(progress, /data-slot="progress-indicator"[^>]*class="motion-progress-indicator/)
  assert.match(progress, /transform:translateX\(-22%\)/)
  assert.match(css, /\.motion-progress-indicator\s*\{\s*transition:\s*transform var\(--motion-data\)/)
})

test('TC-28-07 Dashboard and Analysis chart reveals share timing and respect reduced motion', () => {
  let reducedMotion = false
  const Bar = () => null
  const chartLoad = createComponentLoader({
    'next/link': { default: Link },
    recharts: Object.fromEntries(['Bar', 'BarChart', 'CartesianGrid', 'Tooltip', 'XAxis', 'YAxis'].map((name) => [name, name === 'Bar' ? Bar : () => null])),
    '@/components/ui/chart': { ChartContainer: () => null, ChartTooltipContent: () => null },
    '@/hooks/use-prefers-reduced-motion': { usePrefersReducedMotion: () => reducedMotion },
  })
  const { DashboardCharts } = chartLoad('components/layout/dashboard-charts.tsx')
  const props = { data: [{ date: '2026-10-04', hours: '1.25' }], filters: {} }
  for (const preference of [false, true, false]) {
    reducedMotion = preference
    const bar = descendants(DashboardCharts(props)).find((element) => element.type === Bar)
    assert.equal(bar.props.animationDuration, MOTION_DURATION_MS.chart)
    assert.equal(bar.props.isAnimationActive, !preference)
  }
  assert.equal(descendants(DashboardCharts({ ...props, data: [] })).some((element) => element.type === Bar), false)
  const analysis = source('../../app/analysis/page.tsx')
  assert.equal((analysis.match(/animationDuration=\{MOTION_DURATION_MS\.chart\}/g) ?? []).length, 2)
  assert.equal((analysis.match(/isAnimationActive=\{!prefersReducedMotion\}/g) ?? []).length, 2)
})

test('TC-28-08 controls, interactive cards, data rows, overlays and touch states use shared motion rules', async () => {
  const controls = [
    'components/ui/button.tsx', 'components/ui/input.tsx', 'components/ui/textarea.tsx',
    'components/ui/select.tsx', 'components/ui/tabs.tsx', 'components/ui/toggle.tsx',
    'components/ui/switch.tsx', 'components/ui/checkbox.tsx', 'components/ui/dropdown-menu.tsx',
    'components/ui/radio-group.tsx',
  ]
  for (const path of controls) assert.match(source(`../../${path}`), /motion-control/, path)
  for (const path of [
    '../../components/page/company/company-card.tsx', '../../components/page/projects/project-card.tsx',
    '../../components/page/projects/portfolio-card.tsx', '../../components/page/work-items/work-item-card.tsx',
  ]) assert.match(source(path), /motion-card/)
  assert.match(source('../../components/ui/table.tsx'), /motion-data-row/)
  assert.match(source('../../components/ui/skeleton.tsx'), /motion-skeleton/)
  assert.match(source('../../components/ui/toast.tsx'), /data-slot="toast"/)
  const styles = await compiledStyles
  let foundTouchTargetRule = false
  styles.walkAtRules('media', (rule) => {
    if (rule.params.includes('pointer: coarse') && rule.toString().includes('min-height: 2.75rem')) foundTouchTargetRule = true
  })
  assert.equal(foundTouchTargetRule, true)
})

test('TC-28-22 card hover and pressed depth overrides raised surfaces and pressed wins on desktop', async () => {
  const styles = await compiledStyles
  const hoverRules = matchingRules(styles, '.motion-card:hover')
  const activeRules = matchingRules(styles, '.motion-card:active')
  const raisedRules = matchingRules(styles, '.surface-raised')
  const hover = hoverRules.find((rule) => !isLayered(rule))
  const active = activeRules.filter((rule) => !isLayered(rule)).at(-1)
  const raised = raisedRules.find(isLayered)

  assert.ok(hover, 'hover motion must be outside lower-precedence utility layers')
  assert.ok(active, 'pressed motion must be outside lower-precedence utility layers')
  assert.ok(raised, 'the shared raised surface utility remains layered')
  assert.ok(styles.nodes.indexOf(hover.parent) < styles.nodes.indexOf(active.parent), 'pressed state follows hover in the compiled cascade')
  assert.equal(declaration(hover, 'box-shadow'), 'var(--surface-shadow-hover)')
  assert.equal(declaration(active, 'box-shadow'), 'var(--surface-shadow-pressed)')
  assert.equal(declaration(active, 'translate'), '0 0')
})

test('TC-28-23 closed overlays use the shared exit duration and easing in the winning cascade', async () => {
  const styles = await compiledStyles
  const closed = matchingRules(styles, "[data-state='closed'][data-slot='select-content']").find((rule) => !isLayered(rule))
  const enter = matchingRules(styles, "[data-slot='select-content']").find((rule) => !isLayered(rule))

  assert.ok(closed, 'closed-state timing must be unlayered so it can override overlay entrance timing')
  assert.ok(enter)
  assert.equal(declaration(closed, 'animation-duration'), 'var(--motion-fast)')
  assert.equal(declaration(closed, 'animation-timing-function'), 'var(--ease-exit)')
  assert.ok(closed.selector.split(',').some((selector) => selector.trim() === "[data-state='closed'][data-slot='dialog-overlay']"))
  assert.ok(closed.selector.split(',').some((selector) => selector.trim() === "[data-state='closed'][data-slot='alert-dialog-overlay']"))
})

test('TC-28-24 toast swipe cancel transitions translate while active swipe movement stays immediate', async () => {
  const styles = await compiledStyles
  const toast = matchingRules(styles, "[data-slot='toast']").find((rule) => !isLayered(rule))
  const swipeMove = matchingRules(styles, "[data-slot='toast'][data-swipe='move']").find((rule) => !isLayered(rule))

  assert.ok(toast)
  assert.ok(swipeMove, 'unlayered swipe rule must preserve Radix pointer tracking')
  assert.match(declaration(toast, 'transition-property'), /(?:^|, )translate(?:,|$)/)
  assert.match(declaration(toast, 'transition-property'), /transform/)
  assert.match(declaration(toast, 'transition-property'), /opacity/)
  assert.equal(declaration(swipeMove, 'transition'), 'none')
})

function navigationFixture({ active = true, withObserver = true } = {}) {
  const frames = new Map()
  const listeners = new Map()
  const writes = []
  let nextFrame = 0
  let reads = 0
  let resizeObserver
  const view = {
    requestAnimationFrame(callback) { frames.set(++nextFrame, callback); return nextFrame },
    cancelAnimationFrame(id) { frames.delete(id) },
    addEventListener(event, callback) { listeners.set(event, callback) },
    removeEventListener(event, callback) { if (listeners.get(event) === callback) listeners.delete(event) },
  }
  const link = { getBoundingClientRect() { reads += 1; return { top: 144, height: 44 } } }
  const navigation = {
    ownerDocument: { defaultView: view },
    querySelector(selector) { assert.equal(selector, '[aria-current="page"]'); return active ? link : null },
    getBoundingClientRect() { reads += 1; return { top: 100 } },
  }
  const indicator = { style: { opacity: '0', setProperty: (key, value) => writes.push([key, value]) } }
  class FakeResizeObserver {
    constructor(callback) { this.callback = callback; resizeObserver = this }
    observe(element) { assert.equal(element, navigation); this.observed = true }
    disconnect() { this.disconnected = true }
  }
  const fixtureLoad = createComponentLoader({}, { ResizeObserver: withObserver ? FakeResizeObserver : undefined })
  const { observeNavigationIndicator } = fixtureLoad('components/layout/navigation-motion.ts')
  const dispose = observeNavigationIndicator(navigation, indicator)
  function flush() {
    const pending = [...frames.values()]
    frames.clear()
    pending.forEach((callback) => callback())
  }
  return { frames, listeners, writes, indicator, dispose, flush, get reads() { return reads }, get observer() { return resizeObserver } }
}

test('TC-28-11 navigation coalesces resize bursts into one measurement and accepts later updates', () => {
  const fixture = navigationFixture()
  assert.equal(fixture.observer.observed, true)
  fixture.listeners.get('resize')()
  fixture.observer.callback()
  assert.equal(fixture.frames.size, 1)
  assert.equal(fixture.reads, 0)
  fixture.flush()
  assert.equal(fixture.reads, 2)
  assert.deepEqual(fixture.writes, [['--shared-nav-y', '55px']])
  assert.equal(fixture.indicator.style.opacity, '1')
  fixture.listeners.get('resize')()
  fixture.flush()
  assert.equal(fixture.reads, 4)
  fixture.dispose()
})

test('TC-28-12 navigation unmount cancels pending frames and releases resize subscriptions', () => {
  const fixture = navigationFixture()
  fixture.dispose()
  assert.equal(fixture.frames.size, 0)
  assert.equal(fixture.listeners.size, 0)
  assert.equal(fixture.observer.disconnected, true)
  fixture.flush()
  assert.equal(fixture.reads, 0)
  assert.equal(fixture.writes.length, 0)
})

test('TC-28-13 unmatched routes hide the marker without measuring a nonexistent destination', () => {
  const fixture = navigationFixture({ active: false })
  fixture.indicator.style.opacity = '1'
  fixture.flush()
  assert.equal(fixture.indicator.style.opacity, '0')
  assert.equal(fixture.reads, 0)
  assert.equal(fixture.writes.length, 0)
  fixture.dispose()
})

test('TC-28-14 navigation works without ResizeObserver and without a browser view', () => {
  const fixture = navigationFixture({ withObserver: false })
  fixture.flush()
  assert.equal(fixture.indicator.style.opacity, '1')
  fixture.dispose()
  assert.equal(fixture.listeners.size, 0)
  const { observeNavigationIndicator } = load('components/layout/navigation-motion.ts')
  assert.doesNotThrow(() => observeNavigationIndicator({ ownerDocument: { defaultView: null } }, {})())
})

test('TC-28-15 lazy mobile marker mounts its measurement inside the navigation and cleans up', () => {
  const effects = []
  const calls = []
  const navigation = {}
  const indicator = { parentElement: navigation }
  const cleanup = () => calls.push('cleanup')
  const fixtureLoad = createComponentLoader({
    react: { useRef: () => ({ current: indicator }), useEffect: (effect, dependencies) => effects.push({ effect, dependencies }) },
    '@/components/layout/navigation-motion': { observeNavigationIndicator: (...args) => { calls.push(args); return cleanup } },
  })
  const { SharedNavigationIndicator } = fixtureLoad('components/layout/shared-navigation-indicator.tsx')
  const tree = SharedNavigationIndicator({ pathname: '/projects/project-28' })
  assert.equal(tree.props['aria-hidden'], 'true')
  assert.equal(tree.props['data-slot'], 'shared-navigation-indicator')
  assert.deepEqual([...effects[0].dependencies], ['/projects/project-28'])
  const dispose = effects[0].effect()
  assert.equal(calls[0][0], navigation)
  assert.equal(calls[0][1], indicator)
  dispose()
  assert.equal(calls[1], 'cleanup')
})

test('TC-28-16 route motion preserves viewport positioning and content releases its transformed layer', async () => {
  const styles = await compiledStyles
  styles.walkAtRules('keyframes', (rule) => {
    if (rule.params === 'pms-page-enter') rule.walkDecls((declaration) => assert.equal(declaration.prop, 'opacity'))
    if (['pms-content-enter', 'pms-value-change'].includes(rule.params)) {
      const finish = rule.nodes.find((node) => node.selector === 'to')
      assert.equal(finish.nodes.find((node) => node.prop === 'transform').value, 'none')
    }
  })
})

test('TC-28-17 compiled stagger preserves bounded delays instead of resetting them with a shorthand', async () => {
  const styles = await compiledStyles
  const delays = []
  let hasEntrance = false
  styles.walkRules((rule) => {
    if (!rule.selector.startsWith('.motion-stagger >')) return
    rule.walkDecls((declaration) => {
      assert.notEqual(declaration.prop, 'animation', 'shorthand would reset per-child delays')
      if (declaration.prop === 'animation-name') hasEntrance = declaration.value === 'pms-content-enter'
      if (declaration.prop === 'animation-delay') delays.push(declaration.value)
    })
  })
  assert.equal(hasEntrance, true)
  assert.deepEqual(delays, ['0ms', ...[1, 2, 3, 4].map((step) => `calc(var(--motion-stagger-step) * ${step})`)])
  assert.ok(MOTION_DURATION_MS.staggerStep * 4 <= 100)
})

test('TC-28-18 exact formatted KPI feedback changes keys while integer counters retain their component', async () => {
  const { SummaryStatCard } = load('components/layout/summary-stat-card.tsx')
  const { AnimatedStatValue } = load('components/ui/animated-stat-value.tsx')
  const valueSpan = (value) => descendants(SummaryStatCard({ label: 'Open', value }))
    .find((element) => element.type === 'span' && element.props.className === MOTION_CLASS.valueChange)
  assert.equal(valueSpan('8').key, valueSpan('8').key)
  assert.notEqual(valueSpan('8').key, valueSpan('9').key)
  const counter = descendants(SummaryStatCard({ label: 'Open', value: 0 })).find((element) => element.type === AnimatedStatValue)
  assert.equal(counter.props.value, 0)
  const nextCounter = descendants(SummaryStatCard({ label: 'Open', value: 9 })).find((element) => element.type === AnimatedStatValue)
  assert.equal(counter.key, nextCounter.key)
  assert.equal(valueSpan(React.createElement('strong', null, 'unavailable')), undefined)
  const styles = await compiledStyles
  let display
  styles.walkRules('.motion-value-change', (rule) => rule.walkDecls('display', (declaration) => { display = declaration.value }))
  assert.equal(display, 'inline-block')
})

test('TC-28-25 Board loading preserves status columns with decorative cards and local scrolling', () => {
  const { ContentLoadingSkeleton } = load('components/layout/content-loading-skeleton.tsx')
  const { WORK_ITEM_STATUSES } = load('lib/work-items.ts')
  const html = renderToStaticMarkup(React.createElement(ContentLoadingSkeleton, { layout: 'board' }))
  assert.match(html, /aria-hidden="true"[^>]*data-layout="board"/)
  assert.match(html, /overflow-x-auto overscroll-contain/)
  assert.equal((html.match(/data-slot="skeleton"/g) ?? []).length, WORK_ITEM_STATUSES.length * 3)
  assert.doesNotMatch(html, /role="status"|role="alert"/)
  assert.match(source('../../app/board/page.tsx'), /role="status" aria-busy="true"[^\n]*ContentLoadingSkeleton layout="board"/)
  assert.match(source('../../app/work-items/page.tsx'), /PageState kind="loading" title="กำลังโหลด Work Items…" loadingLayout="rows"/)
})

test('TC-28-26 data and expanded group reveals preserve sticky positioning and reduced-motion behavior', async () => {
  const styles = await compiledStyles
  const entrance = matchingRules(styles, '.motion-data-enter').find((rule) => declaration(rule, 'animation'))
  assert.match(declaration(entrance, 'animation'), /^pms-page-enter var\(--motion-fast\)/)
  assert.equal(declaration(entrance, 'transform'), undefined)
  let disabled = false
  styles.walkAtRules('media', (rule) => {
    if (rule.params.includes('prefers-reduced-motion: reduce') && rule.toString().includes('.motion-data-enter') && rule.toString().includes('animation: none')) disabled = true
  })
  assert.equal(disabled, true)
  assert.match(source('../../components/page/work-items/work-item-grouped-list.tsx'), /motion-data-enter min-w-0 space-y-4/)
})

test('TC-28-27 tooltip and toast exit timing overrides entrance while accordion shares centralized timing', async () => {
  const styles = await compiledStyles
  for (const slot of ['tooltip-content', 'toast']) {
    const exit = matchingRules(styles, `[data-state='closed'][data-slot='${slot}']`).find((rule) => !isLayered(rule))
    assert.equal(declaration(exit, 'animation-duration'), 'var(--motion-fast)')
    assert.equal(declaration(exit, 'animation-timing-function'), 'var(--ease-exit)')
  }
  const accordion = matchingRules(styles, "[data-slot='accordion-content']").find((rule) => !rule.selector.includes('closed'))
  assert.equal(declaration(accordion, 'animation-duration'), 'var(--motion-overlay)')
})

function stickyFixture({ withRoot = true, withObserver = true, withView = true } = {}) {
  const frames = new Map()
  const listeners = new Map()
  const measured = []
  const observed = []
  let id = 0
  let reads = 0
  let disconnected = false
  let observerCallback
  let top = 122
  const view = {
    requestAnimationFrame(callback) { frames.set(++id, callback); return id },
    cancelAnimationFrame(frame) { frames.delete(frame) },
    getComputedStyle() { reads++; return { paddingTop: '12px' } },
    addEventListener(event, callback) { listeners.set(event, callback) },
    removeEventListener(event) { listeners.delete(event) },
  }
  const header = { ownerDocument: { defaultView: withView ? view : null }, getBoundingClientRect() { reads++; return { height: 36, top } } }
  const root = withRoot ? {
    getBoundingClientRect() { reads++; return { top: 100 } },
    addEventListener(event, callback, options) { assert.equal(options.passive, true); listeners.set(event, callback) },
    removeEventListener(event) { listeners.delete(event) },
  } : null
  class Observer {
    constructor(callback) { observerCallback = callback }
    observe(element) { observed.push(element) }
    disconnect() { disconnected = true }
  }
  const fixtureLoad = createComponentLoader({}, { ResizeObserver: withObserver ? Observer : undefined })
  const { observeStickyHeader } = fixtureLoad('components/page/work-items/sticky-header-observer.ts')
  const dispose = observeStickyHeader(header, root, 9, (height, stuck) => measured.push([height, stuck]))
  return {
    frames, listeners, measured, observed, dispose,
    get reads() { return reads }, get disconnected() { return disconnected },
    resize() { observerCallback?.() }, move(value) { top = value },
    flush() { const callbacks = [...frames.values()]; frames.clear(); callbacks.forEach((callback) => callback()) },
  }
}

test('TC-28-28 sticky scroll bursts perform one geometry read per element per frame with correct offsets', () => {
  const fixture = stickyFixture()
  assert.deepEqual(fixture.measured, [[36, true]])
  assert.equal(fixture.observed.length, 2)
  for (let i = 0; i < 20; i++) fixture.listeners.get('scroll')()
  fixture.listeners.get('resize')()
  fixture.resize()
  assert.equal(fixture.frames.size, 1)
  assert.equal(fixture.reads, 3)
  fixture.move(123)
  fixture.flush()
  assert.equal(fixture.reads, 6)
  assert.deepEqual(fixture.measured.at(-1), [36, false])
  fixture.dispose()
})

test('TC-28-29 sticky observer cancels pending work and supports missing root observer or browser view', () => {
  const fixture = stickyFixture()
  fixture.listeners.get('scroll')()
  fixture.dispose()
  fixture.flush()
  assert.equal(fixture.frames.size, 0)
  assert.equal(fixture.listeners.size, 0)
  assert.equal(fixture.disconnected, true)
  assert.equal(fixture.measured.length, 1)
  const fallback = stickyFixture({ withRoot: false, withObserver: false })
  assert.deepEqual(fallback.measured, [[36, false]])
  fallback.listeners.get('resize')()
  fallback.flush()
  fallback.dispose()
  const server = stickyFixture({ withView: false })
  assert.equal(server.measured.length, 0)
  assert.doesNotThrow(server.dispose)
})

function frameScheduler() {
  const frames = new Map()
  let id = 0
  return {
    frames,
    requestAnimationFrame(callback) { frames.set(++id, callback); return id },
    cancelAnimationFrame(frame) { frames.delete(frame) },
    flush(time) { const callbacks = [...frames.values()]; frames.clear(); callbacks.forEach((callback) => callback(time)) },
  }
}

test('TC-28-30 only safe integer metrics interpolate while exact hours formatted values and unchanged counts do not', () => {
  const { canTweenMetric, tweenMetric } = load('components/ui/metric-motion.ts')
  for (const value of [0, 8, -4, Number.MAX_SAFE_INTEGER]) assert.equal(canTweenMetric(value), true)
  for (const value of ['12.50', '1,024', 1.25, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) assert.equal(canTweenMetric(value), false)
  const scheduler = frameScheduler()
  const values = []
  const dispose = tweenMetric(8, 8, scheduler, (value) => values.push(value))
  assert.deepEqual(values, [8])
  assert.equal(scheduler.frames.size, 0)
  dispose()
})

test('TC-28-31 count updates stay within their bounds and finish at the exact target within shared duration', () => {
  const { tweenMetric } = load('components/ui/metric-motion.ts')
  for (const [from, to] of [[0, 12], [12, 0], [-8, 8]]) {
    const scheduler = frameScheduler()
    const values = []
    tweenMetric(from, to, scheduler, (value) => values.push(value))
    scheduler.flush(0)
    scheduler.flush(MOTION_DURATION_MS.standard / 2)
    scheduler.flush(MOTION_DURATION_MS.standard)
    assert.equal(values[0], from)
    assert.equal(values.at(-1), to)
    assert.ok(values.every((value) => Number.isInteger(value) && value >= Math.min(from, to) && value <= Math.max(from, to)))
    assert.equal(scheduler.frames.size, 0)
  }
})

test('TC-28-32 cancelling count motion prevents stale frame writes after a replacement or unmount', () => {
  const { tweenMetric } = load('components/ui/metric-motion.ts')
  const scheduler = frameScheduler()
  const values = []
  const dispose = tweenMetric(0, 12, scheduler, (value) => values.push(value))
  const stale = [...scheduler.frames.values()][0]
  dispose()
  stale(400)
  assert.deepEqual(values, [0])
  assert.equal(scheduler.frames.size, 0)
})

test('TC-28-33 integer metric starts exact resumes from the displayed value and snaps immediately for reduced motion', () => {
  const scheduler = frameScheduler()
  const node = { ownerDocument: { defaultView: scheduler }, textContent: '8' }
  const refs = [{ current: node }, { current: 8 }]
  let refIndex = 0
  let effect
  let reduced = false
  const fixtureLoad = createComponentLoader({
    react: { ...React, useRef: () => refs[refIndex++], useEffect: (callback) => { effect = callback } },
    '@/hooks/use-prefers-reduced-motion': { usePrefersReducedMotion: () => reduced },
  })
  const { AnimatedStatValue } = fixtureLoad('components/ui/animated-stat-value.tsx')
  const render = (value) => { refIndex = 0; return AnimatedStatValue({ value }) }
  assert.equal(descendants(render(8)).find((element) => element.props.className === 'sr-only').props.children, 8)
  effect()()
  assert.equal(scheduler.frames.size, 0)
  const updated = render(12)
  let dispose = effect()
  scheduler.flush(0)
  scheduler.flush(MOTION_DURATION_MS.standard / 4)
  const displayed = Number(node.textContent)
  assert.ok(displayed > 8 && displayed < 12)
  assert.equal(descendants(updated).find((element) => element.props.className === 'sr-only').props.children, 12)
  dispose()
  render(3)
  dispose = effect()
  assert.equal(Number(node.textContent), displayed)
  dispose()
  reduced = true
  render(3)
  effect()
  assert.equal(node.textContent, '3')
  assert.equal(scheduler.frames.size, 0)
})

test('TC-28-34 Daily Work summary uses skeletons while loading and never reports false zero on a failed read', () => {
  const { StatsCard } = load('components/page/daily-work/stats-card.tsx')
  const render = (props) => renderToStaticMarkup(React.createElement(StatsCard, { totalHours: '0', totalLogs: 0, ...props }))
  const loading = render({ isLoading: true })
  assert.equal((loading.match(/data-slot="skeleton"/g) ?? []).length, 2)
  assert.doesNotMatch(loading, />0<\/span>/)
  const failed = render({ unavailable: true })
  assert.equal((failed.match(/>—<\/span>/g) ?? []).length, 2)
  assert.doesNotMatch(failed, /data-slot="skeleton"|>0<\/span>/)
  const loaded = render({ totalHours: '12.50000000000000000001', totalLogs: 3 })
  assert.match(loaded, /12\.50000000000000000001/)
})

test('TC-28-35 Daily Work keeps latest loading feedback rejects stale reads and exposes error with working retry', async () => {
  const states = []
  const refs = []
  let stateIndex = 0
  let refIndex = 0
  let effects = []
  const pending = []
  const fixtureLoad = createComponentLoader({
    react: { ...React,
      useState(initial) { const index = stateIndex++; if (!(index in states)) states[index] = typeof initial === 'function' ? initial() : initial; return [states[index], (value) => { states[index] = typeof value === 'function' ? value(states[index]) : value }] },
      useRef(initial) { const index = refIndex++; refs[index] ??= { current: initial }; return refs[index] },
      useEffect(callback) { effects.push(callback) },
      useMemo: (callback) => callback(), useCallback: (callback) => callback,
    },
    'next/navigation': { useRouter: () => ({ replace() {} }), useSearchParams: () => new URLSearchParams('date=2026-10-04') },
    '@/hooks/use-toast': { toast() {} },
  }, { fetch: () => new Promise((resolve) => pending.push(resolve)) })
  const Page = fixtureLoad('app/daily-work/page.tsx').default
  const { PageState } = fixtureLoad('components/layout/page-state.tsx')
  const { WorkLogList } = fixtureLoad('components/page/daily-work/work-log-list.tsx')
  const render = () => { stateIndex = 0; refIndex = 0; effects = []; return descendants(Page()) }
  const state = (tree) => tree.find((element) => element.type === PageState)
  render()
  effects[0]()
  assert.equal(state(render()).props.kind, 'loading')
  effects[1]()
  render()
  effects[1]()
  const response = (workLogs) => ({ ok: true, json: async () => ({ workLogs }) })
  pending[0](response([{ id: 'stale', hours: '2' }]))
  await new Promise(setImmediate)
  assert.equal(state(render()).props.kind, 'loading')
  pending[1](response([{ id: 'latest', hours: '1.25' }]))
  await new Promise(setImmediate)
  assert.equal(render().find((element) => element.type === WorkLogList).props.workLogs[0].id, 'latest')
  effects[1]()
  pending[2]({ ok: false, status: 500, json: async () => ({ error: { code: 'INTERNAL_ERROR', message: 'Unavailable' } }) })
  await new Promise(setImmediate)
  const failed = state(render())
  assert.equal(failed.props.kind, 'error')
  failed.props.action.props.onClick()
  assert.equal(state(render()).props.kind, 'loading')
  pending[3](response([]))
  await new Promise(setImmediate)
  assert.equal(render().find((element) => element.type === WorkLogList).props.workLogs.length, 0)
})

test('TC-28-19 loading skeletons match cards, reports, rows and profiles and stay decorative', () => {
  const { ContentLoadingSkeleton } = load('components/layout/content-loading-skeleton.tsx')
  for (const [layout, count] of [['cards', 12], ['rows', 8], ['report', 5], ['profile', 8]]) {
    const html = renderToStaticMarkup(React.createElement(ContentLoadingSkeleton, { layout }))
    assert.match(html, new RegExp(`aria-hidden="true"[^>]*data-layout="${layout}"`))
    assert.equal((html.match(/data-slot="skeleton"/g) ?? []).length, count)
    assert.doesNotMatch(html, /role="status"|role="alert"/)
  }
})

test('TC-28-20 loading placeholders disappear for empty and error states while retry remains available', () => {
  const { PageState } = load('components/layout/page-state.tsx')
  const html = (kind) => renderToStaticMarkup(React.createElement(PageState, {
    kind, title: 'ข้อมูล Projects', loadingLayout: 'cards',
    action: React.createElement('button', { type: 'button' }, 'ลองอีกครั้ง'),
  }))
  assert.match(html('loading'), /role="status" aria-busy="true"/)
  assert.match(html('loading'), /data-layout="cards"/)
  for (const kind of ['empty', 'error']) {
    assert.doesNotMatch(html(kind), /data-slot="skeleton"/)
    assert.match(html(kind), /aria-busy="false"/)
    assert.match(html(kind), /<button type="button">ลองอีกครั้ง<\/button>/)
  }
  assert.match(html('error'), /role="alert"/)
})

test('TC-28-21 closing the mobile drawer restores keyboard focus to its registered trigger', () => {
  const SheetContent = () => null
  const triggerRef = { current: { focus: () => { focused += 1 } } }
  let focused = 0
  let prevented = 0
  const fixtureLoad = createComponentLoader({
    react: { ...React, useContext: () => ({ isMobile: true, openMobile: true, setOpenMobile() {}, toggleSidebar() {}, triggerRef }) },
    '@/components/ui/sheet': Object.fromEntries(['Sheet', 'SheetContent', 'SheetDescription', 'SheetHeader', 'SheetTitle'].map((name) => [name, name === 'SheetContent' ? SheetContent : () => null])),
  })
  const { Sidebar, SidebarTrigger } = fixtureLoad('components/ui/sidebar.tsx')
  const close = descendants(Sidebar({ children: 'Navigation' })).find((element) => element.type === SheetContent).props.onCloseAutoFocus
  assert.equal(SidebarTrigger({}).props.ref, triggerRef)
  close({ preventDefault: () => { prevented += 1 } })
  assert.equal(focused, 1)
  assert.equal(prevented, 1)
  triggerRef.current = null
  close({ preventDefault: () => { prevented += 1 } })
  assert.equal(focused, 1)
  assert.equal(prevented, 1, 'an unmounted trigger leaves native focus handling intact')
})

test('TC-28-09 dashboard hierarchy gives recent work the focal grid and keeps risk queues paired', () => {
  const dashboard = source('../../app/page.tsx')
  assert.match(dashboard, /grid min-w-0 gap-4 xl:grid-cols-12/)
  assert.match(dashboard, /xl:col-span-7"><WorkItemList title="Work Items ล่าสุด"/)
  assert.match(dashboard, /RecentProjects[\s\S]*?xl:col-span-5/)
  assert.equal((dashboard.match(/min-w-0 xl:col-span-6"><WorkItemList/g) ?? []).length, 2)
  assert.match(source('../../components/ui/tabs.tsx'), /motion-tab-content/)
})

test('TC-28-10 motion unit cases have a reusable isolated suite command and tree reporter name', () => {
  const packageJson = JSON.parse(source('../../package.json'))
  const runner = source('../../tests/run.mjs')
  const testingGuide = source('../../document/process/testing.md')
  assert.equal(packageJson.scripts['test:frontend-motion'], 'node tests/run.mjs frontend-motion')
  assert.match(runner, /"frontend-motion": \{ files: \[join\(testRoot, "frontend-ui", "motion-system\.test\.mjs"\)\] \}/)
  assert.match(testingGuide, /pnpm test:frontend-motion[\s\S]*bash scripts\/test-unit\.sh frontend-motion/)
})
