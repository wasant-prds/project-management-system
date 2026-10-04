import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { formatDate } from "@/lib/utils"
import { Skeleton } from '@/components/ui/skeleton'

type StatsCardProps = {
  totalHours: string
  totalLogs: number
  date?: Date
  isLoading?: boolean
  unavailable?: boolean
}

export function StatsCard({ totalHours, totalLogs, date, isLoading = false, unavailable = false }: Readonly<StatsCardProps>) {
  return (
    <Card className="card-shadow">
      <CardHeader>
        <CardTitle className="text-base">สรุปวันที่เลือก</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex min-w-0 items-start justify-between gap-3">
          <span className="shrink-0 text-sm text-muted-foreground">ชั่วโมงรวม</span>
          {isLoading ? <Skeleton aria-hidden="true" className="h-7 w-20" /> : <span key={totalHours} className="motion-value-change content-wrap min-w-0 text-right text-xl font-semibold tabular-nums">{unavailable ? '—' : totalHours}</span>}
        </div>
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">รายการบันทึก</span>
          {isLoading ? <Skeleton aria-hidden="true" className="h-7 w-12" /> : <span key={totalLogs} className="motion-value-change text-xl font-semibold tabular-nums">{unavailable ? '—' : totalLogs}</span>}
        </div>
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">วันที่</span>
          <span className="text-sm font-semibold">{date ? formatDate(date) : 'ทุกวัน'}</span>
        </div>
      </CardContent>
    </Card>
  )
}

