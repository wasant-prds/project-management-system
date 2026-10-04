'use client'

import { useMemo } from 'react'
import { Bar, BarChart, CartesianGrid, Tooltip, XAxis, YAxis } from 'recharts'
import { ChartContainer, ChartTooltipContent } from '@/components/ui/chart'
import type { DashboardFilters } from '@/lib/dashboard'
import { usePrefersReducedMotion } from '@/hooks/use-prefers-reduced-motion'
import { MOTION_DURATION_MS } from '@/components/ui/motion'

type LoggedHoursPoint = { date: string; hours: string }

export function DashboardCharts({ data }: Readonly<{ data: LoggedHoursPoint[]; filters: DashboardFilters }>) {
  const prefersReducedMotion = usePrefersReducedMotion()
  const chartData = useMemo(() => data.map((point) => ({ ...point, plottedHours: Number(point.hours) })), [data])
  if (!data.length) return null
  return (
    <ChartContainer
      config={{ plottedHours: { label: 'ชั่วโมง', color: 'var(--chart-2)' } }}
      className="h-[260px] min-w-0 w-full"
    >
      <BarChart data={chartData} margin={{ top: 8, right: 8, bottom: 4, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" opacity={0.35} />
        <XAxis
          dataKey="date"
          stroke="var(--muted-foreground)"
          fontSize={11}
          minTickGap={18}
          tickFormatter={(date: string) => date.slice(5)}
        />
        <YAxis stroke="var(--muted-foreground)" fontSize={11} width={36} />
        <Tooltip
          content={<ChartTooltipContent />}
          labelFormatter={(date: string) => `วันที่ ${date}`}
        />
        <Bar
          dataKey="plottedHours"
          fill="var(--chart-2)"
          radius={[4, 4, 0, 0]}
          maxBarSize={36}
          animationDuration={MOTION_DURATION_MS.chart}
          isAnimationActive={!prefersReducedMotion && data.length <= 100}
        />
      </BarChart>
    </ChartContainer>
  )
}
