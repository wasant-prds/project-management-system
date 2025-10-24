import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Plus, Search } from "lucide-react"
import { WorkLog } from "./types"
import { WorkLogCard } from "./work-log-card"
import { formatDate } from "@/lib/utils"

type WorkLogListProps = {
  workLogs: WorkLog[]
  date?: Date
  searchQuery: string
  onSearchChange: (query: string) => void
  onWorkLogClick: (workLog: WorkLog) => void
  onAddClick: () => void
}

export function WorkLogList({
  workLogs,
  date,
  searchQuery,
  onSearchChange,
  onWorkLogClick,
  onAddClick,
}: Readonly<WorkLogListProps>) {
  return (
    <div className="space-y-3">
      <Card className="card-shadow">
        <CardHeader className="pb-0">
          <CardTitle className="text-base">Work Logs for : {date ? formatDate(date) : 'All'}</CardTitle>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              type="search"
              placeholder="Search work logs..."
              className="pl-10 bg-secondary/50"
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
            />
          </div>
        </CardHeader>
      </Card>
      {workLogs.length === 0 ? (
        <Card className="card-shadow">
          <CardContent className="py-10 text-center">
            <p className="text-muted-foreground">
              {searchQuery.trim() ? 'No work logs match your search.' : 'No work logs for this date.'}
            </p>
            <Button className="mt-4 gap-2" onClick={onAddClick}>
              <Plus className="h-4 w-4" />
              Add Work Log
            </Button>
          </CardContent>
        </Card>
      ) : (
        workLogs.map((log) => (
          <WorkLogCard key={log.id} workLog={log} onClick={onWorkLogClick} />
        ))
      )}
    </div>
  )
}

