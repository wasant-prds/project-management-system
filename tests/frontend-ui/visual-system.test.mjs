import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import test from 'node:test'
import vm from 'node:vm'

const require = createRequire(import.meta.url)
const React = require('react')
const { renderToStaticMarkup } = require('react-dom/server')
const typescript = require('typescript')
const postcss = require('postcss')
const tailwind = require('@tailwindcss/postcss')
const { getTooltipTranslateXY } = require('recharts/lib/util/tooltip/translate.js')

function source(path) {
  return readFileSync(new URL(path, import.meta.url), 'utf8')
}

const css = source('../../app/globals.css')
const card = source('../../components/ui/card.tsx')
const button = source('../../components/ui/button.tsx')
const input = source('../../components/ui/input.tsx')
const textarea = source('../../components/ui/textarea.tsx')
const select = source('../../components/ui/select.tsx')
const tabs = source('../../components/ui/tabs.tsx')
const chart = source('../../components/ui/chart.tsx')
const dashboardChart = source('../../components/layout/dashboard-charts.tsx')
const pageLayout = source('../../components/layout/page-layout.ts')
const responsiveDialog = source('../../components/ui/responsive-dialog.ts')
const packageJson = JSON.parse(source('../../package.json'))
const runner = source('../../tests/run.mjs')
const testingDocs = source('../../document/process/testing.md')
const motionHook = source('../../hooks/use-prefers-reduced-motion.ts')
const appLayout = source('../../app/layout.tsx')

async function compileStyles() {
  const result = await postcss([tailwind()]).process(css, { from: 'app/globals.css' })
  return result.css
}

function renderWorkLogCard() {
  const primitive = (tag) => function Primitive({ className, children, ...props }) {
    const domProps = Object.fromEntries(Object.entries(props).filter(([key]) => !['variant', 'size', 'asChild'].includes(key)))
    return React.createElement(tag, { ...domProps, className }, children)
  }
  const ui = {
    Card: primitive('div'),
    CardContent: primitive('div'),
    CardDescription: primitive('div'),
    CardHeader: primitive('div'),
    CardTitle: primitive('div'),
    Button: primitive('button'),
    Badge: primitive('span'),
    Avatar: primitive('div'),
    AvatarFallback: primitive('span'),
    Label: primitive('label'),
  }
  const icons = Object.fromEntries(['CheckSquare', 'Clock', 'FileText', 'MessageSquareText', 'X'].map((name) => [name, primitive('svg')]))
  const sourceText = source('../../components/page/daily-work/work-log-card.tsx')
  const js = typescript.transpileModule(sourceText, {
    compilerOptions: { module: typescript.ModuleKind.CommonJS, target: typescript.ScriptTarget.ES2022, jsx: typescript.JsxEmit.ReactJSX },
  }).outputText
  const pageModule = { exports: {} }
  vm.runInNewContext(js, {
    module: pageModule,
    exports: pageModule.exports,
    require: (name) => {
      if (name === 'react') return React
      if (name === 'react/jsx-runtime') return require('react/jsx-runtime')
      if (name === '@/components/ui/card') return {
        Card: ui.Card, CardContent: ui.CardContent, CardDescription: ui.CardDescription,
        CardHeader: ui.CardHeader, CardTitle: ui.CardTitle,
      }
      if (name === '@/components/ui/button') return { Button: ui.Button }
      if (name === '@/components/ui/badge') return { Badge: ui.Badge }
      if (name === '@/components/ui/avatar') return { Avatar: ui.Avatar, AvatarFallback: ui.AvatarFallback }
      if (name === '@/components/ui/label') return { Label: ui.Label }
      if (name === 'lucide-react') return icons
      if (name === '@/lib/utils') return { formatDate: (date) => String(date).slice(0, 10) }
      throw new Error(`Unexpected WorkLogCard import: ${name}`)
    },
  }, { filename: 'components/page/daily-work/work-log-card.tsx' })

  return renderToStaticMarkup(React.createElement(pageModule.exports.WorkLogCard, {
    workLog: {
      date: '2026-10-03', hours: '1.5', description: 'Review work', remarks: 'Follow up', status: 'Open',
      workItem: { title: 'Accessible work', kind: 'Task' },
      project: { id: 'project-1', name: 'Project Alpha', colorProject: null },
    },
    onClick: () => {},
  }))
}

function inspectMotionPreference(matches) {
  let listener
  let cleanup
  let notifications = 0
  let added = 0
  let removed = 0
  const mediaQuery = {
    matches,
    addEventListener: (_event, callback) => { listener = callback; added += 1 },
    removeEventListener: (_event, callback) => { if (callback === listener) removed += 1 },
  }
  const sourceText = source('../../hooks/use-prefers-reduced-motion.ts')
  const js = typescript.transpileModule(sourceText, {
    compilerOptions: { module: typescript.ModuleKind.CommonJS, target: typescript.ScriptTarget.ES2022 },
  }).outputText
  const pageModule = { exports: {} }
  vm.runInNewContext(js, {
    module: pageModule,
    exports: pageModule.exports,
    require: (name) => name === 'react'
      ? { useSyncExternalStore: (subscribe, getSnapshot) => {
        cleanup = subscribe(() => { notifications += 1 })
        return getSnapshot()
      } }
      : (() => { throw new Error(`Unexpected motion hook import: ${name}`) })(),
    window: { matchMedia: (query) => {
      assert.equal(query, '(prefers-reduced-motion: reduce)')
      return mediaQuery
    } },
  })
  const snapshot = pageModule.exports.usePrefersReducedMotion()
  listener()
  cleanup()
  return { snapshot, notifications, added, removed }
}

test('light, dark and special-dark each define theme-aware surface shadows', () => {
  const themeBlocks = (selector) => {
    const blocks = []
    postcss.parse(css).walkRules((rule) => {
      if (rule.selectors.includes(selector)) blocks.push(rule.toString())
    })
    return blocks
  }
  assert.match(css, /:root\s*\{[^}]*--surface-shadow-soft:/s)
  assert.match(css, /:root\s*\{[^}]*--surface-shadow-raised:/s)
  assert.match(css, /:root\s*\{[^}]*--surface-shadow-inset:/s)
  assert.ok(themeBlocks('.dark').some((block) => block.includes('--shadow-raised')))
  assert.ok(themeBlocks('.special-dark').some((block) => block.includes('--shadow-raised')))
  assert.ok(themeBlocks('.special-dark').some((block) => block.includes('--shadow-dark')))
  assert.doesNotMatch(themeBlocks('.dark').join(''), /var\(--primary\).*transparent/)
  assert.doesNotMatch(css, /#3ba7ab|rgba?\(94,\s*104,\s*121/)
})

test('shared cards and emphasized surfaces consume shared shadow tokens', () => {
  assert.match(card, /surface-soft/)
  assert.match(card, /className\?\.includes\('card-shadow'\)/)
  assert.match(css, /\.surface-soft\s*\{[^}]*var\(--surface-shadow-soft\)/s)
  assert.match(css, /\.surface-raised\s*\{[^}]*var\(--surface-shadow-raised\)/s)
  assert.match(css, /\.card-shadow\s*\{[^}]*var\(--surface-shadow-raised\)/s)
})

test('form controls use inset surfaces while focus, invalid and selected states remain explicit', () => {
  assert.match(input, /surface-inset/)
  assert.match(textarea, /surface-inset/)
  assert.match(select, /surface-inset/)
  assert.match(button, /focus-visible:ring-ring\/50/)
  assert.match(button, /aria-invalid:border-destructive/)
  assert.match(tabs, /data-\[state=active\]:bg-background/)
  assert.match(tabs, /data-\[state=active\]:text-foreground/)
  assert.match(css, /\*\:focus-visible\s*\{[^}]*outline-width:\s*2px/s)
})

test('Tailwind compilation emits the active tab inset utility variant', async () => {
  const compiled = await compileStyles()
  const activeTabRule = compiled.indexOf('.data-\\[state\\=active\\]\\:surface-inset')
  assert.notEqual(activeTabRule, -1)
  assert.match(compiled.slice(activeTabRule, activeTabRule + 300), /data-state="active"[\s\S]*box-shadow:\s*var\(--surface-shadow-inset\)/)
  assert.match(compiled, /\.motion-safe\\:active\\:translate-y-px[\s\S]*?prefers-reduced-motion:\s*no-preference/)
})

test('Tailwind font utilities use the Geist fonts loaded by the root layout', async () => {
  const compiled = await compileStyles()
  assert.match(compiled, /--font-sans:\s*var\(--font-geist-sans\)/)
  assert.match(compiled, /--font-mono:\s*var\(--font-geist-mono\)/)
  assert.match(compiled, /--font-heading:\s*var\(--font-geist-sans\)/)
  assert.match(appLayout, /GeistSans\.variable/)
  assert.match(appLayout, /GeistMono\.variable/)
  assert.doesNotMatch(css, /Source Sans Pro|Playfair Display/)
})

test('root layout loads Vercel Analytics only when explicitly enabled', () => {
  const js = typescript.transpileModule(appLayout, {
    compilerOptions: {
      module: typescript.ModuleKind.CommonJS,
      target: typescript.ScriptTarget.ES2022,
      jsx: typescript.JsxEmit.ReactJSX,
    },
  }).outputText

  const renderWithSetting = (setting) => {
    const passthrough = ({ children }) => React.createElement(React.Fragment, null, children)
    const pageModule = { exports: {} }
    vm.runInNewContext(js, {
      module: pageModule,
      exports: pageModule.exports,
      process: { env: { VERCEL_ANALYTICS_ENABLED: setting } },
      require: (name) => {
        if (name === 'react') return React
        if (name === 'react/jsx-runtime') return require('react/jsx-runtime')
        if (name === 'geist/font/sans') return { GeistSans: { variable: 'geist-sans-variable' } }
        if (name === 'geist/font/mono') return { GeistMono: { variable: 'geist-mono-variable' } }
        if (name === '@vercel/analytics/next') return {
          Analytics: () => React.createElement('script', { src: '/_vercel/insights/script.js' }),
        }
        if (name === '@/components/layout/theme-provider') return { ThemeProvider: passthrough }
        if (name === '@/components/layout/owner-settings-provider') return { OwnerSettingsProvider: passthrough }
        if (name === '@/components/layout/application-loading-shell') return { ApplicationLoadingShell: () => null }
        if (name === '@/components/ui/toaster') return { Toaster: () => null }
        if (name === '@/components/layout/cinematic-runtime') return { CinematicRuntime: () => null }
        if (name === '@/components/layout/performance-metrics') return { PerformanceMetrics: () => null }
        if (name === './globals.css') return {}
        throw new Error(`Unexpected root layout import: ${name}`)
      },
    }, { filename: 'app/layout.tsx' })

    return renderToStaticMarkup(React.createElement(
      pageModule.exports.default,
      null,
      React.createElement('main', null, 'PMS'),
    ))
  }

  assert.doesNotMatch(renderWithSetting(undefined), /_vercel\/insights\/script\.js/)
  assert.doesNotMatch(renderWithSetting('false'), /_vercel\/insights\/script\.js/)
  assert.match(renderWithSetting('true'), /_vercel\/insights\/script\.js/)
})

test('Daily Work card detail and remarks actions render as native keyboard buttons', () => {
  const markup = renderWorkLogCard()
  const buttons = [...markup.matchAll(/<button\b/g)]
  assert.equal(buttons.length, 2)
  assert.match(markup, /<button[^>]*type="button"[^>]*>.*?Remarks[\s\S]*?<\/button>/)
  assert.match(markup, /<button[^>]*type="button"[^>]*>ดูรายละเอียด<\/button>/)
  assert.doesNotMatch(markup, /<div[^>]*role="button"/)
})

test('all eight menu layouts use shrinkable page shells without page-level horizontal scrolling', () => {
  assert.match(pageLayout, /PAGE_INNER\s*=\s*'min-w-0/)
  assert.match(pageLayout, /PAGE_MAIN\s*=\s*'min-h-0 min-w-0 flex-1 overflow-x-hidden/)

  const pages = [
    '../../app/page.tsx',
    '../../app/projects/page.tsx',
    '../../app/work-items/page.tsx',
    '../../app/board/page.tsx',
    '../../app/analysis/page.tsx',
    '../../app/daily-work/page.tsx',
    '../../app/company/page.tsx',
    '../../app/settings/page.tsx',
  ]

  for (const path of pages) {
    const page = source(path)
    assert.match(page, /PAGE_INNER/, `${path} should use the shared responsive inner layout`)
    if (path.endsWith('/board/page.tsx')) {
      assert.match(page, /<main className="flex min-h-0 min-w-0 flex-1 overflow-hidden">/)
    } else {
      assert.match(page, /PAGE_MAIN/)
    }
  }
})

test('responsive dialog shells fit phone, tablet and notebook viewports', () => {
  assert.match(responsiveDialog, /h-\[calc\(100dvh-1rem\)\]/)
  assert.match(responsiveDialog, /sm:h-\[calc\(100dvh-2rem\)\]/)
  assert.match(responsiveDialog, /lg:h-\[90dvh\]/)
  assert.match(responsiveDialog, /overflow-hidden/)
  assert.match(responsiveDialog, /overflow-y-auto/)
})

test('ChartContainer owns one responsive container and Dashboard does not nest another', () => {
  assert.match(chart, /<RechartsPrimitive\.ResponsiveContainer debounce=\{80\}>/)
  assert.match(chart, /min-w-0 w-full max-w-full/)
  assert.match(chart, /overflow-hidden/)
  assert.match(dashboardChart, /<ChartContainer/)
  assert.doesNotMatch(dashboardChart, /ResponsiveContainer/)
  assert.match(dashboardChart, /<BarChart/)

  const analysis = source('../../components/page/analysis/analysis-charts.tsx')
  assert.match(analysis, /ChartContainer[^>]*className="h-\[320px\] min-w-0 w-full"/s)
  assert.doesNotMatch(analysis, /ResponsiveContainer/)
})

test('chart legend, tooltip and labels stay bounded by the chart frame', () => {
  assert.match(css, /\[data-slot='chart'\][^{]*\{[^}]*min-width:\s*0[^}]*overflow:\s*hidden/s)
  assert.match(css, /\[data-slot='chart'\][^{]*\{[^}]*container-type:\s*inline-size/s)
  assert.match(css, /\.recharts-default-legend\s*\{[^}]*flex-wrap:\s*wrap/s)
  assert.match(css, /\.recharts-legend-item\s*\{[^}]*overflow-wrap:\s*anywhere/s)
  assert.match(css, /\.recharts-tooltip-wrapper\s*\{[^}]*max-width:\s*min\(15rem, calc\(100cqw - 4rem\)\)/s)
  assert.match(css, /\.recharts-tooltip-wrapper > \*\s*\{[^}]*overflow-wrap:\s*anywhere/s)
  assert.match(chart, /data-slot="chart-tooltip"/)
  assert.match(chart, /surface-raised/)
})

test('long tooltip content remains within phone and wider chart frames', () => {
  for (const chartWidth of [240, 320, 760]) {
    const tooltipWidth = Math.min(240, chartWidth - 64)
    const viewBox = { x: 42, y: 8, width: chartWidth - 54, height: 280 }
    for (const x of [viewBox.x + 10, viewBox.x + viewBox.width / 2, viewBox.x + viewBox.width - 10]) {
      const translatedX = getTooltipTranslateXY({
        allowEscapeViewBox: { x: false, y: false },
        coordinate: { x, y: 50 },
        key: 'x',
        offsetTopLeft: 10,
        position: undefined,
        reverseDirection: { x: false, y: false },
        tooltipDimension: tooltipWidth,
        viewBox,
        viewBoxDimension: viewBox.width,
      })
      assert.ok(translatedX >= 0, `tooltip starts inside ${chartWidth}px chart`)
      assert.ok(translatedX + tooltipWidth <= chartWidth, `tooltip ends inside ${chartWidth}px chart`)
    }
  }
})

test('interaction motion is brief and reduced-motion preference suppresses it', () => {
  assert.match(button, /motion-control/)
  assert.doesNotMatch(card, /duration-150/)
  assert.match(button, /motion-safe:active:translate-y-px/)
  assert.match(button, /motion-safe:enabled:hover:-translate-y-px/)
  assert.match(button, /motion-reduce:active:translate-y-0/)
  assert.match(source('../../components/page/work-items/work-item-card.tsx'), /motion-card/)
  assert.match(css, /--motion-fast:\s*160ms/)
  assert.match(css, /--motion-overlay:\s*190ms/)
  assert.match(css, /\.motion-card\s*\{[\s\S]*?transition-property:\s*translate, border-color, box-shadow/)
  assert.match(css, /\[data-slot='dialog-content'\][\s\S]*?animation-duration:\s*var\(--motion-overlay\)/)
  assert.match(css, /@media \(prefers-reduced-motion:\s*reduce\)/)
  assert.match(css, /transition-duration:\s*0\.01ms !important/)
  assert.match(css, /animation-iteration-count:\s*1 !important/)
  assert.match(motionHook, /useSyncExternalStore/)
  assert.deepEqual(inspectMotionPreference(true), { snapshot: true, notifications: 1, added: 1, removed: 1 })
  assert.deepEqual(inspectMotionPreference(false), { snapshot: false, notifications: 1, added: 1, removed: 1 })
  assert.match(dashboardChart, /animationDuration=\{MOTION_DURATION_MS\.chart\}[\s\S]*isAnimationActive=\{!prefersReducedMotion && data.length <= 100\}/)
  const analysis = source('../../components/page/analysis/analysis-charts.tsx')
  assert.equal((analysis.match(/isAnimationActive=\{!prefersReducedMotion(?: && hoursChartData.length <= 100)?\}/g) ?? []).length, 2)
})

test('focused UI suite has reusable pnpm and shared Node runner commands', () => {
  assert.equal(packageJson.scripts['test:frontend-ui'], 'node tests/run.mjs frontend-ui')
  assert.match(runner, /"frontend-ui": \{ directory: join\(testRoot, "frontend-ui"\) \}/)
  assert.match(testingDocs, /pnpm test:frontend-ui[\s\S]*node tests\/run\.mjs frontend-ui/)
})
