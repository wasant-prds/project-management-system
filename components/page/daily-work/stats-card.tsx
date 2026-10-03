import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { formatDate } from "@/lib/utils"

type StatsCardProps = {
  totalHours: string
  totalLogs: number
  date?: Date
}

export function StatsCard({ totalHours, totalLogs, date }: Readonly<StatsCardProps>) {
  return (
    <Card className="card-shadow">
      <CardHeader>
        <CardTitle className="text-base">สรุปวันที่เลือก</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">ชั่วโมงรวม</span>
          <span className="text-xl font-semibold tabular-nums">{totalHours}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">รายการบันทึก</span>
          <span className="text-xl font-semibold tabular-nums">{totalLogs}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">วันที่</span>
          <span className="text-sm font-semibold">{date ? formatDate(date) : 'ทุกวัน'}</span>
        </div>
      </CardContent>
    </Card>
  )
}

