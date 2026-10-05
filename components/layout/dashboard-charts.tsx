'use client'

import { useMemo } from 'react'
import { Bar, BarChart, CartesianGrid, Tooltip, XAxis, YAxis } from 'recharts'
import { ChartContainer, ChartTooltipContent } from '@/components/ui/chart'
import { CHART_AXIS_PROPS, CHART_GRID_PROPS, VISUAL_STATES, chartColorVariable, chartDatasetKey } from '@/components/ui/product-identity'
import { useChartDatasetKey } from '@/components/ui/use-chart-dataset-key'
import { PageState } from '@/components/layout/page-state'
import type { DashboardFilters } from '@/lib/dashboard'
import { usePrefersReducedMotion } from '@/hooks/use-prefers-reduced-motion'
import { MOTION_DURATION_MS } from '@/components/ui/motion'

type LoggedHoursPoint = { date: string; hours: string }

export function DashboardCharts({ data }: Readonly<{ data: LoggedHoursPoint[]; filters: DashboardFilters }>) {
  const prefersReducedMotion = usePrefersReducedMotion()
  const chartData = useMemo(() => data.map((point) => ({ ...point, plottedHours: Number(point.hours) })), [data])
  const datasetKey = chartDatasetKey('dashboard-hours', chartData.length, chartData[0]?.date ?? '', chartData.at(-1)?.date ?? '')
  const motionKey = useChartDatasetKey(datasetKey)
  if (!data.length) {
    return <PageState visual="chart" title={VISUAL_STATES.chart.title} description={VISUAL_STATES.chart.description} />
  }
  const seriesColor = chartColorVariable('secondary')
  return (
    <ChartContainer
      config={{ plottedHours: { label: 'ชั่วโมง', color: seriesColor } }}
      className="h-[260px] min-w-0 w-full"
    >
      <BarChart data={chartData} margin={{ top: 8, right: 8, bottom: 4, left: 0 }}>
        <CartesianGrid {...CHART_GRID_PROPS} />
        <XAxis
          {...CHART_AXIS_PROPS}
          dataKey="date"
          minTickGap={18}
          tickFormatter={(date: string) => date.slice(5)}
        />
        <YAxis {...CHART_AXIS_PROPS} width={36} />
        <Tooltip
          content={<ChartTooltipContent />}
          labelFormatter={(date: string) => `วันที่ ${date}`}
        />
        <Bar
          key={motionKey}
          dataKey="plottedHours"
          fill={seriesColor}
          radius={[4, 4, 0, 0]}
          maxBarSize={36}
          animationDuration={MOTION_DURATION_MS.chart}
          isAnimationActive={!prefersReducedMotion && data.length <= 100}
        />
      </BarChart>
    </ChartContainer>
  )
}
