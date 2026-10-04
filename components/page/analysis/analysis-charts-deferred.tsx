'use client'

import { DeferredSection } from '@/components/ui/deferred-section'
import { RetryableLazy } from '@/components/ui/retryable-lazy'
import { ChartLoadError } from '@/components/ui/chart-load-error'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { HoursPeriodTable } from './report-tables'
import type { AnalysisReport } from '@/lib/analysis-export'

const loadStatusChart = () => import('./analysis-charts').then((module) => ({ default: module.AnalysisStatusChart }))
const loadHoursChart = () => import('./analysis-charts').then((module) => ({ default: module.AnalysisHoursChart }))
const plotLoading = <Skeleton className="h-[320px] w-full" />

export function AnalysisChartsDeferred({ report }: Readonly<{ report: AnalysisReport }>) {
  return <div className="grid min-w-0 gap-4 xl:grid-cols-2" aria-label="กราฟ Analysis">
    <Card className="motion-content-enter min-w-0 overflow-hidden card-shadow">
      <CardHeader><CardTitle>สถานะ Work Items</CardTitle><CardDescription>สถานะปัจจุบันของรายการที่ตรงกับช่วงและตัวกรอง</CardDescription></CardHeader>
      <CardContent className="min-w-0 overflow-hidden">
        {report.summary.total ? <DeferredSection fallback={plotLoading}>
          <RetryableLazy loader={loadStatusChart} componentProps={{ report }} loading={plotLoading}
            error={(retry) => <ChartLoadError heightClass="h-[320px]" onRetry={retry} />} />
        </DeferredSection> : <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">ไม่มี Work Item ให้แสดงในกราฟนี้</p>}
      </CardContent>
    </Card>
    <Card className="motion-content-enter min-w-0 overflow-hidden card-shadow">
      <CardHeader><CardTitle>Logged hours ตามช่วงเวลา</CardTitle><CardDescription>รวมจาก TimeEntry.date ด้วย grouping แบบ {report.meta.loggedHoursGrouping} ตาม Asia/Bangkok</CardDescription></CardHeader>
      <CardContent className="min-w-0 overflow-hidden">
        {report.loggedHoursByPeriod.length ? <DeferredSection fallback={plotLoading}>
          <RetryableLazy loader={loadHoursChart} componentProps={{ report }} loading={plotLoading}
            error={(retry) => <ChartLoadError heightClass="h-[320px]" onRetry={retry} />} />
        </DeferredSection> : <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">ไม่มี Daily Work ให้แสดงในกราฟนี้</p>}
        <HoursPeriodTable report={report} />
      </CardContent>
    </Card>
  </div>
}
