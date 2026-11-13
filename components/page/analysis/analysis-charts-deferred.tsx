'use client'

import { DeferredSection } from '@/components/ui/deferred-section'
import { RetryableLazy } from '@/components/ui/retryable-lazy'
import { ChartLoadError } from '@/components/layout/chart-load-error'
import { InlineState } from '@/components/layout/page-state'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { HoursPeriodTable } from './report-tables'
import type { AnalysisReport } from '@/lib/analysis-export'

const loadStatusChart = () => import('./analysis-charts').then((module) => ({ default: module.AnalysisStatusChart }))
const loadHoursChart = () => import('./analysis-charts').then((module) => ({ default: module.AnalysisHoursChart }))
const plotLoading = <Skeleton className="h-[320px] w-full" />

export function AnalysisChartsDeferred({ report }: Readonly<{ report: AnalysisReport }>) {
  const grouping = { day: 'รายวัน', week: 'รายสัปดาห์', month: 'รายเดือน' }[report.meta.loggedHoursGrouping]
  return <div className="grid min-w-0 gap-4 xl:grid-cols-2" aria-label="กราฟ Analysis">
    <Card className="motion-content-enter min-w-0 overflow-hidden card-shadow">
      <CardHeader><CardTitle>สถานะ Work Items</CardTitle><CardDescription><span aria-hidden="true" className="mr-2 inline-block h-2 w-2 rounded-sm bg-[var(--chart-primary)]" />สถานะปัจจุบัน · หน่วย: รายการ</CardDescription></CardHeader>
      <CardContent className="min-w-0 overflow-hidden">
        {report.summary.total ? <DeferredSection fallback={plotLoading}>
          <RetryableLazy loader={loadStatusChart} componentProps={{ report }} loading={plotLoading}
            error={(retry) => <ChartLoadError heightClass="h-[320px]" onRetry={retry} />} />
        </DeferredSection> : <InlineState visual="chart" title="ไม่มี Work Item ให้แสดงในกราฟนี้" description="กราฟจะแสดงเมื่อมี Work Item ในช่วงและตัวกรองนี้" />}
      </CardContent>
    </Card>
    <Card className="motion-content-enter min-w-0 overflow-hidden card-shadow">
      <CardHeader><CardTitle>ชั่วโมงที่บันทึกตามช่วงเวลา</CardTitle><CardDescription><span aria-hidden="true" className="mr-2 inline-block h-2 w-2 rounded-sm bg-[var(--chart-secondary)]" />ชั่วโมงที่บันทึก{grouping} · หน่วย: ชั่วโมง</CardDescription></CardHeader>
      <CardContent className="min-w-0 overflow-hidden">
        {report.loggedHoursByPeriod.length ? <DeferredSection fallback={plotLoading}>
          <RetryableLazy loader={loadHoursChart} componentProps={{ report }} loading={plotLoading}
            error={(retry) => <ChartLoadError heightClass="h-[320px]" onRetry={retry} />} />
        </DeferredSection> : <InlineState visual="chart" title="ไม่มี Daily Work ให้แสดงในกราฟนี้" description="กราฟจะแสดงเมื่อมีการบันทึกชั่วโมงในช่วงที่เลือก" />}
        {report.loggedHoursByPeriod.length > 0 && <details className="mt-3 border-t border-border/60 pt-3">
          <summary className="cursor-pointer rounded-sm text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">ชั่วโมงและข้อมูลต้นทาง ({report.loggedHoursByPeriod.length} ช่วง)</summary>
          <div className="mt-3 min-w-0"><HoursPeriodTable report={report} /></div>
        </details>}
      </CardContent>
    </Card>
  </div>
}
