'use client'

import Link from 'next/link'
import { Bar, BarChart, CartesianGrid, Tooltip, XAxis, YAxis } from 'recharts'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ChartContainer, ChartTooltipContent } from '@/components/ui/chart'
import { dashboardDailyWorkHref } from '@/lib/dashboard-links'
import type { DashboardFilters } from '@/lib/dashboard'
import { usePrefersReducedMotion } from '@/hooks/use-prefers-reduced-motion'

type LoggedHoursPoint = { date: string; hours: string }

export function DashboardCharts({
  data,
  filters,
}: Readonly<{ data: LoggedHoursPoint[]; filters: DashboardFilters }>) {
  const prefersReducedMotion = usePrefersReducedMotion()
  const sourceHref = dashboardDailyWorkHref(filters)
  const chartData = data.map((point) => ({ ...point, plottedHours: Number(point.hours) }))

  return (
    <Card className="min-w-0 overflow-hidden card-shadow">
      <CardHeader className="flex min-w-0 flex-row flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <CardTitle>ชั่วโมง Daily Work ตามวัน</CardTitle>
          <CardDescription>รวมจาก TimeEntry.date ในช่วงและตัวกรองที่เลือก</CardDescription>
        </div>
        <Link href={sourceHref} className="shrink-0 text-sm text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">เปิด Daily Work</Link>
      </CardHeader>
      <CardContent className="min-w-0 overflow-hidden">
        {chartData.length === 0 ? (
          <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">ไม่มี Daily Work ในช่วงนี้</p>
        ) : (
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
                animationDuration={150}
                isAnimationActive={!prefersReducedMotion}
              />
            </BarChart>
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  )
}
