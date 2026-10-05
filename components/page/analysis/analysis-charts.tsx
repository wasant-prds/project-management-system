'use client'

import Link from 'next/link'
import { useMemo } from 'react'
import { Bar, BarChart, CartesianGrid, Line, LineChart, Tooltip, XAxis, YAxis } from 'recharts'
import { ChartContainer, ChartTooltipContent } from '@/components/ui/chart'
import { CHART_AXIS_PROPS, CHART_GRID_PROPS, VISUAL_STATES, chartColorVariable, chartDatasetKey, chartStrokeDasharray } from '@/components/ui/product-identity'
import { useChartDatasetKey } from '@/components/ui/use-chart-dataset-key'
import { PageState } from '@/components/layout/page-state'
import { displayStatus } from './report-tables'
import { analysisDailyWorkHref, analysisWorkItemsHref } from '@/lib/analysis-links'
import type { AnalysisReport } from '@/lib/analysis-export'
import { renderHoursChartDot } from './hours-chart-dot'
import { usePrefersReducedMotion } from '@/hooks/use-prefers-reduced-motion'
import { MOTION_DURATION_MS } from '@/components/ui/motion'

type StatusChartPoint = { href: string; accessibleName: string }
type StatusBarShapeProps = {
  x?: number
  y?: number
  width?: number
  height?: number
  fill?: string
  payload?: StatusChartPoint
}

function StatusChartLinkBar({ x = 0, y = 0, width = 0, height = 0, fill = 'var(--chart-primary)', payload }: StatusBarShapeProps) {
  if (!payload) return <g />
  return (
    <Link href={payload.href} aria-label={payload.accessibleName}>
      <rect x={x} y={y} width={width} height={height} rx={4} fill={fill} />
    </Link>
  )
}

function shortPeriodLabel(startDate: string, endDate: string, grouping: string) {
  if (grouping === 'month') return startDate.slice(0, 7)
  if (startDate === endDate) return startDate.slice(5)
  return `${startDate.slice(5)}–${endDate.slice(5)}`
}

export function AnalysisStatusChart({ report }: Readonly<{ report: AnalysisReport }>) {
  const prefersReducedMotion = usePrefersReducedMotion()
  const period = report.meta.period
  const sourceFilters = report.meta.filters
  const statusChartData = useMemo(() => report.breakdowns.status.map((row) => ({
    name: displayStatus(row.value),
    value: row.count,
    href: analysisWorkItemsHref(sourceFilters, period, { status: row.value }),
    accessibleName: `เปิด Work Items สถานะ ${displayStatus(row.value)} จำนวน ${row.count} รายการ`,
  })), [report, sourceFilters, period])
  const seriesColor = chartColorVariable('primary')
  const datasetKey = chartDatasetKey('analysis-status', statusChartData.length, statusChartData[0]?.name ?? '', statusChartData.at(-1)?.name ?? '')
  const motionKey = useChartDatasetKey(datasetKey)
  if (statusChartData.length === 0) {
    return <PageState visual="chart" title={VISUAL_STATES.chart.title} description={VISUAL_STATES.chart.description} />
  }
  return (
    <ChartContainer config={{ value: { label: 'Work Items', color: seriesColor } }} className="h-[320px] min-w-0 w-full">
      <BarChart data={statusChartData} layout="vertical" margin={{ top: 4, right: 12, bottom: 4, left: 4 }}>
        <CartesianGrid {...CHART_GRID_PROPS} />
        <XAxis {...CHART_AXIS_PROPS} type="number" allowDecimals={false} />
        <YAxis {...CHART_AXIS_PROPS} dataKey="name" type="category" width={104} />
        <Tooltip content={<ChartTooltipContent />} />
        <Bar
          key={motionKey}
          dataKey="value"
          fill={seriesColor}
          radius={[0, 4, 4, 0]}
          maxBarSize={24}
          animationDuration={MOTION_DURATION_MS.chart}
          isAnimationActive={!prefersReducedMotion}
          shape={(props: unknown) => <StatusChartLinkBar {...props as StatusBarShapeProps} />}
        />
      </BarChart>
    </ChartContainer>
  )
}

export function AnalysisHoursChart({ report }: Readonly<{ report: AnalysisReport }>) {
  const prefersReducedMotion = usePrefersReducedMotion()
  const sourceFilters = report.meta.filters
  const hoursChartData = useMemo(() => report.loggedHoursByPeriod.map((row) => ({
    ...row,
    label: shortPeriodLabel(row.startDate, row.endDate, report.meta.loggedHoursGrouping),
    plottedHours: Number(row.hours),
    href: analysisDailyWorkHref(sourceFilters, { startDate: row.startDate, endDate: row.endDate }),
    accessibleName: `เปิด Daily Work ช่วง ${row.startDate} ถึง ${row.endDate} รวม ${row.hours} ชั่วโมง`,
  })), [report, sourceFilters])
  const seriesColor = chartColorVariable('secondary')
  const datasetKey = chartDatasetKey('analysis-hours', hoursChartData.length, hoursChartData[0]?.label ?? '', hoursChartData.at(-1)?.label ?? '')
  const motionKey = useChartDatasetKey(datasetKey)
  const strokeDasharray = chartStrokeDasharray('secondary')
  if (hoursChartData.length === 0) {
    return <PageState visual="chart" title={VISUAL_STATES.chart.title} description={VISUAL_STATES.chart.description} />
  }
  return (
    <ChartContainer config={{ plottedHours: { label: 'ชั่วโมง', color: seriesColor } }} className="h-[320px] min-w-0 w-full">
      <LineChart data={hoursChartData} margin={{ top: 8, right: 12, bottom: 4, left: 0 }}>
        <CartesianGrid {...CHART_GRID_PROPS} />
        <XAxis {...CHART_AXIS_PROPS} dataKey="label" minTickGap={16} />
        <YAxis {...CHART_AXIS_PROPS} width={42} />
        <Tooltip content={<ChartTooltipContent labelFormatter={(_label, payload) => {
          const point = payload?.[0]?.payload as { startDate?: string; endDate?: string } | undefined
          return point ? `${point.startDate} – ${point.endDate}` : ''
        }} />} />
        <Line
          key={motionKey}
          type="monotone"
          dataKey="plottedHours"
          stroke={seriesColor}
          {...(strokeDasharray ? { strokeDasharray } : {})}
          strokeWidth={2}
          animationDuration={MOTION_DURATION_MS.chart}
          isAnimationActive={!prefersReducedMotion && hoursChartData.length <= 100}
          dot={renderHoursChartDot}
        />
      </LineChart>
    </ChartContainer>
  )
}
