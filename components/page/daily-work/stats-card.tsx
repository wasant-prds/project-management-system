import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from '@/components/ui/skeleton'
import { formatHours } from '@/lib/decimal-hours'

type StatsCardProps = {
  totalHours: string
  totalLogs: number
  periodLabel?: string
  isLoading?: boolean
  unavailable?: boolean
}

export function StatsCard({ totalHours, totalLogs, periodLabel = 'ทุกวัน', isLoading = false, unavailable = false }: Readonly<StatsCardProps>) {
  return (
    <Card data-work-log-summary="" className="card-shadow gap-3 py-4">
      <CardHeader className="px-4 py-0">
        <CardTitle className="text-base">สรุปช่วงที่เลือก</CardTitle>
        <p className="content-wrap text-xs text-muted-foreground">{periodLabel}</p>
      </CardHeader>
      <CardContent className="space-y-3 px-4 py-0">
        <div className="flex min-w-0 items-start justify-between gap-3">
          <span className="shrink-0 text-sm text-muted-foreground">ชั่วโมงรวม <span className="text-xs">(ชม.)</span></span>
          {isLoading ? <Skeleton aria-hidden="true" className="h-7 w-20" /> : <span key={totalHours} className="motion-value-change content-wrap min-w-0 text-right text-xl font-semibold tabular-nums">{unavailable ? '—' : formatHours(totalHours)}</span>}
        </div>
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">รายการบันทึก</span>
          {isLoading ? <Skeleton aria-hidden="true" className="h-7 w-12" /> : <span key={totalLogs} className="motion-value-change text-xl font-semibold tabular-nums">{unavailable ? '—' : totalLogs}</span>}
        </div>
      </CardContent>
    </Card>
  )
}

