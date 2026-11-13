'use client'

import Link from 'next/link'
import { dashboardDailyWorkHref } from '@/lib/dashboard-links'
import { DeferredSection } from '@/components/ui/deferred-section'
import { RetryableLazy } from '@/components/ui/retryable-lazy'
import { ChartLoadError } from '@/components/layout/chart-load-error'
import { InlineState } from '@/components/layout/page-state'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import type { DashboardCharts as Charts } from './dashboard-charts'

const loadChart = () => import('./dashboard-charts').then((module) => ({ default: module.DashboardCharts }))
const plotLoading = <Skeleton className="h-[260px] w-full" />

export function DashboardChartsDeferred(props: React.ComponentProps<typeof Charts>) {
  return <Card className="motion-content-enter min-w-0 gap-3 overflow-hidden py-4 card-shadow">
    <CardHeader className="flex min-w-0 flex-row flex-wrap items-start justify-between gap-3">
      <div className="min-w-0"><CardTitle>ชั่วโมง Daily Work ตามวัน</CardTitle><CardDescription><span aria-hidden="true" className="mr-2 inline-block h-2 w-2 rounded-sm bg-[var(--chart-secondary)]" />ชั่วโมงที่บันทึก · หน่วย: ชั่วโมง</CardDescription></div>
      <Link href={dashboardDailyWorkHref(props.filters)} className="shrink-0 text-sm text-link underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">เปิด Daily Work</Link>
    </CardHeader>
    <CardContent className="min-w-0 overflow-hidden">
      {props.data.length ? <DeferredSection fallback={plotLoading}>
        <RetryableLazy loader={loadChart} componentProps={props} loading={plotLoading}
          error={(retry) => <ChartLoadError heightClass="h-[260px]" onRetry={retry} />} />
      </DeferredSection> : <InlineState visual="chart" title="ไม่มี Daily Work ในช่วงนี้" description="กราฟจะแสดงเมื่อมีการบันทึกชั่วโมงในช่วงที่เลือก" />}
    </CardContent>
  </Card>
}
