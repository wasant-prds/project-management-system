import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Label } from "@/components/ui/label"
import { CheckSquare, Clock, FileText, MessageSquareText, X } from "lucide-react"
import { formatDate } from "@/lib/utils"
import { WorkLog } from "./types"
import { useState } from "react"

type WorkLogCardProps = {
  workLog: WorkLog
  onClick: (workLog: WorkLog) => void
}

export function WorkLogCard({ workLog, onClick }: Readonly<WorkLogCardProps>) {
  const project = workLog.project
  const [showRemarks, setShowRemarks] = useState(false)

  const toggleRemarks = (e: React.MouseEvent) => {
    e.stopPropagation()
    setShowRemarks(!showRemarks)
  }

  return (
    <Card
      className="card-shadow cursor-pointer hover:shadow-md transition-shadow mb-2"
      onClick={() => onClick(workLog)}
    >
      <CardHeader>
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <Avatar
              className="h-10 w-10 border-2"
              style={{
                borderColor: project?.colorProject
                  ? `${project.colorProject}33`
                  : 'hsl(var(--primary) / 0.2)'
              }}
            >
              <AvatarFallback
                className="font-semibold"
                style={{
                  backgroundColor: project?.colorProject
                    ? `${project.colorProject}1a`
                    : 'hsl(var(--primary) / 0.1)',
                  color: project?.colorProject
                    ? project.colorProject
                    : 'hsl(var(--primary))'
                }}
              >
                {project?.name.substring(0, 3).toUpperCase() || 'N/A'}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <CardTitle className="text-base">{project?.name || 'No Project'}</CardTitle>
              {workLog.workItem?.title && (
                <p className="truncate text-xs font-medium text-foreground/80">{workLog.workItem.title}</p>
              )}
              <CardDescription className="text-xs">
                {formatDate(workLog.date)}
              </CardDescription>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {workLog.workItem && (
              <Badge variant="outline" className="gap-1 text-xs">
                <CheckSquare className="h-3 w-3" />
                {workLog.workItem.kind}
              </Badge>
            )}
            {workLog.status && (
              <Badge variant="secondary" className="text-xs">
                {workLog.status}
              </Badge>
            )}
            <Badge variant="outline" className="gap-1">
              <Clock className="h-3 w-3" />
              {workLog.hours}h
            </Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {workLog.description && (
          <div className="space-y-2 description-card">
            <div className="flex items-center gap-3 p-2 rounded-lg bg-secondary/30 border border-border/50">
            <FileText className="h-4 w-4 flex-shrink-0 text-primary" />
              <div className="flex-1">
                <p className="text-sm font-medium">{workLog.description}</p>
              </div>
              {workLog.remarks && (
                <Badge 
                  variant="secondary" 
                  className="text-xs action-remarks cursor-pointer hover:bg-secondary/80 transition-colors"
                  onClick={toggleRemarks}
                >
                  {showRemarks ? (
                    <>
                      <X className="h-4 w-4 flex-shrink-0 text-red-500" />
                      Close Remarks
                    </>
                  ) : (
                    <>
                      <MessageSquareText className="h-4 w-4 flex-shrink-0 text-primary" />
                      Remarks
                    </>
                  )}
                </Badge>
              )}
            </div>
          </div>
        )}
        {
          workLog.remarks && showRemarks && (
            <div className="space-y-2 remarks-card">
              <Label>Remarks</Label>
              <div className="p-3 rounded-lg bg-secondary/30 border border-border/50">
                <p className="text-sm whitespace-pre-wrap">{workLog.remarks}</p>
              </div>
            </div>
          )
        }
      </CardContent>
    </Card>
  )
}

