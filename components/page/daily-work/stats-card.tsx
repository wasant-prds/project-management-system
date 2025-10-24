import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { formatDate } from "@/lib/utils"

type StatsCardProps = {
  totalHours: number
  totalLogs: number
  date?: Date
}

export function StatsCard({ totalHours, totalLogs, date }: Readonly<StatsCardProps>) {
  return (
    <Card className="card-shadow">
      <CardHeader>
        <CardTitle className="text-base">Selected Day</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">Total Hours</span>
          <span className="text-lg font-bold">{totalHours.toFixed(1)}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">Work Logs</span>
          <span className="text-lg font-bold">{totalLogs}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">Date</span>
          <span className="text-sm font-semibold">{date ? formatDate(date) : 'All'}</span>
        </div>
      </CardContent>
    </Card>
  )
}

