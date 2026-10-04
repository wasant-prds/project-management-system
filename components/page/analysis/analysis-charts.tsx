'use client'

import Link from 'next/link'
import { useMemo } from 'react'
import { Bar, BarChart, CartesianGrid, Line, LineChart, Tooltip, XAxis, YAxis } from 'recharts'
import { ChartContainer, ChartTooltipContent } from '@/components/ui/chart'
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

function StatusChartLinkBar({ x = 0, y = 0, width = 0, height = 0, fill = 'var(--chart-1)', payload }: StatusBarShapeProps) {
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
  return (
    <ChartContainer config={{ value: { label: 'Work Items', color: 'var(--chart-1)' } }} className="h-[320px] min-w-0 w-full">
      <BarChart data={statusChartData} layout="vertical" margin={{ top: 4, right: 12, bottom: 4, left: 4 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" opacity={0.35} />
        <XAxis type="number" allowDecimals={false} stroke="var(--muted-foreground)" fontSize={11} />
        <YAxis dataKey="name" type="category" width={104} stroke="var(--muted-foreground)" fontSize={10} />
        <Tooltip content={<ChartTooltipContent />} />
        <Bar
          dataKey="value"
          fill="var(--chart-1)"
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
  return (
    <ChartContainer config={{ plottedHours: { label: 'ชั่วโมง', color: 'var(--chart-2)' } }} className="h-[320px] min-w-0 w-full">
      <LineChart data={hoursChartData} margin={{ top: 8, right: 12, bottom: 4, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" opacity={0.35} />
        <XAxis dataKey="label" stroke="var(--muted-foreground)" fontSize={10} minTickGap={16} />
        <YAxis stroke="var(--muted-foreground)" fontSize={11} width={42} />
        <Tooltip content={<ChartTooltipContent labelFormatter={(_label, payload) => {
          const point = payload?.[0]?.payload as { startDate?: string; endDate?: string } | undefined
          return point ? `${point.startDate} – ${point.endDate}` : ''
        }} />} />
        <Line
          type="monotone"
          dataKey="plottedHours"
          stroke="var(--chart-2)"
          strokeWidth={2}
          animationDuration={MOTION_DURATION_MS.chart}
          isAnimationActive={!prefersReducedMotion && hoursChartData.length <= 100}
          dot={renderHoursChartDot}
        />
      </LineChart>
    </ChartContainer>
  )
}
