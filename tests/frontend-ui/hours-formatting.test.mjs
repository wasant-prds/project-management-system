import assert from 'node:assert/strict'
import test from 'node:test'
import { createComponentLoader, descendants, React } from './component-runtime.mjs'
import { previewData } from './preview-fixtures.mjs'

test('hour charts format raw decimal totals in tooltips, axes and accessible names', () => {
  const component = (name) => Object.assign(() => null, { displayName: name })
  const recharts = Object.fromEntries(['Bar', 'BarChart', 'CartesianGrid', 'Line', 'LineChart', 'Tooltip', 'XAxis', 'YAxis'].map((name) => [name, component(name)]))
  const ChartTooltipContent = component('ChartTooltipContent')
  const load = createComponentLoader({
    react: { ...React, useMemo: (callback) => callback() },
    recharts,
    '@/components/ui/chart': { ChartContainer: component('ChartContainer'), ChartTooltipContent },
    '@/components/ui/use-chart-dataset-key': { useChartDatasetKey: (key) => key },
    '@/hooks/use-prefers-reduced-motion': { usePrefersReducedMotion: () => true },
  })
  const report = previewData().analysis
  const hours = '9007199254740993.125'
  report.loggedHoursByPeriod = [{ startDate: '2026-11-01', endDate: '2026-11-01', hours }]
  const { DashboardCharts } = load('components/layout/dashboard-charts.tsx')
  const { AnalysisHoursChart } = load('components/page/analysis/analysis-charts.tsx')
  const trees = [DashboardCharts({ data: [{ date: '2026-11-01', hours }], filters: {} }), AnalysisHoursChart({ report })]
  for (const tree of trees) {
    const nodes = descendants(tree)
    const axis = nodes.find((node) => node.type === recharts.YAxis)
    assert.equal(axis.props.tickFormatter(1.005), '1.01')
    assert.equal(axis.props.tickFormatter(1e34), '1.0e+34', 'large plotted values have bounded axis labels')
    assert.equal(axis.props.tickFormatter(1e-30), '1.0e-30', 'tiny plotted values remain distinguishable from zero')
    const tooltip = nodes.find((node) => node.type === recharts.Tooltip).props.content
    assert.equal(tooltip.type, ChartTooltipContent)
    assert.equal(tooltip.props.valueFormatter(Number(hours), { hours }), '9007199254740993.13')
  }
  assert.match(trees[1].props.children.props.data[0].accessibleName, /9007199254740993\.13 ชั่วโมง$/)
  const line = descendants(trees[1]).find((node) => node.type === recharts.Line)
  assert.equal(line.props.activeDot, false, 'a decorative active dot must not cover the source link')
})

function dailyWorkRuntime() {
  const states = []
  let index = 0
  const requests = []
  const load = createComponentLoader({
    react: { ...React,
      useState(initial) {
        const slot = index++
        if (!(slot in states)) states[slot] = typeof initial === 'function' ? initial() : initial
        return [states[slot], (next) => { states[slot] = typeof next === 'function' ? next(states[slot]) : next }]
      },
      useRef: (initial) => ({ current: initial }),
      useEffect() {}, useMemo: (callback) => callback(), useCallback: (callback) => callback,
    },
    'next/navigation': { useRouter: () => ({ replace() {} }), useSearchParams: () => new URLSearchParams() },
    '@/hooks/use-toast': { toast() {} },
  }, { fetch: async (url, options) => {
    requests.push({ url, options })
    return { ok: true, json: async () => ({ workLogs: [] }) }
  } })
  const Page = load('app/daily-work/page.tsx').default
  const { DeferredWorkLogDialog } = load('components/page/daily-work/deferred-widgets.tsx')
  return {
    requests,
    dialogs() {
      index = 0
      return descendants(Page()).filter((node) => node.type === DeferredWorkLogDialog)
    },
  }
}

test('editing a work log shows two decimals and preserves precise hours when only other fields change', async () => {
  for (const hours of ['4.000000000000000000000000000000', '1.005', '0.000000000000000000000000000001']) {
    const runtime = dailyWorkRuntime()
    const log = { ...previewData().workLogs[0], hours }
    runtime.dialogs().find((node) => node.props.mode === 'view').props.onEdit(log)
    let edit = runtime.dialogs().find((node) => node.props.mode === 'edit')
    assert.match(edit.props.formData.hours, /^\d+\.\d{2}$/)
    edit.props.onFormDataChange({ ...edit.props.formData, description: 'Updated description' })
    edit = runtime.dialogs().find((node) => node.props.mode === 'edit')
    await edit.props.onSubmit()
    const saved = runtime.requests.find(({ options }) => options?.method === 'PATCH')
    assert.ok(saved, `Save succeeds for ${hours}`)
    assert.equal(JSON.parse(saved.options.body).hours, hours)
    assert.equal(log.hours, hours)
  }
})

test('explicitly editing hours saves the new value', async () => {
  const runtime = dailyWorkRuntime()
  runtime.dialogs().find((node) => node.props.mode === 'view').props.onEdit({ ...previewData().workLogs[0], hours: '1.005' })
  const edit = runtime.dialogs().find((node) => node.props.mode === 'edit')
  edit.props.onFormDataChange({ ...edit.props.formData, hours: '2.25' })
  await runtime.dialogs().find((node) => node.props.mode === 'edit').props.onSubmit()
  assert.equal(JSON.parse(runtime.requests.find(({ options }) => options?.method === 'PATCH').options.body).hours, '2.25')
})
