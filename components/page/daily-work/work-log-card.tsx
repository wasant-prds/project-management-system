'use client'

import { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Label } from "@/components/ui/label"
import { CheckSquare, Clock, FileText, MessageSquareText, X } from "lucide-react"
import { formatDate } from "@/lib/utils"
import { WorkLog } from "./types"

type WorkLogCardProps = {
  workLog: WorkLog
  onClick: (workLog: WorkLog) => void
}

export function WorkLogCard({ workLog, onClick }: Readonly<WorkLogCardProps>) {
  const project = workLog.project
  const projectColor = project?.colorProject || 'var(--project-accent)'
  const [showRemarks, setShowRemarks] = useState(false)

  const toggleRemarks = () => {
    setShowRemarks(!showRemarks)
  }

  return (
    <Card data-work-log-card="" className="motion-card card-shadow mb-2">
      <CardHeader>
        <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
          <div data-work-log-identity="" className="flex min-w-0 flex-1 basis-full items-center gap-3 sm:basis-64">
            <Avatar
              className="h-10 w-10 border-2"
              style={{
                borderColor: `color-mix(in srgb, ${projectColor} 20%, transparent)`
              }}
            >
              <AvatarFallback
                className="font-semibold text-foreground"
                style={{
                  backgroundColor: `color-mix(in srgb, ${projectColor} 10%, transparent)`
                }}
              >
                {project?.name.substring(0, 3).toUpperCase() || 'N/A'}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <CardTitle className="text-base">{project?.name || 'No Project'}</CardTitle>
              {workLog.workItem?.title && (
                <p className="truncate text-xs font-medium text-foreground/80">{workLog.workItem.title}</p>
              )}
              <CardDescription className="text-xs">
                {formatDate(workLog.date)}
              </CardDescription>
            </div>
          </div>
          <div className="flex min-w-0 max-w-full flex-wrap items-center gap-2">
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
            <Badge variant="outline" className="min-w-0 max-w-full gap-1 whitespace-normal">
              <Clock className="h-3 w-3 shrink-0" />
              <span className="content-wrap min-w-0 tabular-nums">{workLog.hours}h</span>
            </Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {workLog.description && (
          <div className="space-y-2 description-card">
            <div className="flex min-w-0 flex-1 items-center gap-3 p-2 rounded-lg bg-secondary/30 border border-border/50">
            <FileText className="h-4 w-4 flex-shrink-0 text-link" />
              <div className="min-w-0 flex-1">
                <p className="content-wrap text-sm font-medium">{workLog.description}</p>
              </div>
              {workLog.remarks && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 shrink-0 gap-1 px-2 text-xs action-remarks"
                  onClick={toggleRemarks}
                >
                  {showRemarks ? (
                    <>
                      <X className="h-4 w-4 flex-shrink-0 text-danger" />
                      Close Remarks
                    </>
                  ) : (
                    <>
                      <MessageSquareText className="h-4 w-4 flex-shrink-0 text-link" />
                      Remarks
                    </>
                  )}
                </Button>
              )}
            </div>
          </div>
        )}
        {
          workLog.remarks && showRemarks && (
            <div className="space-y-2 remarks-card">
              <Label>Remarks</Label>
              <div className="p-3 rounded-lg bg-secondary/30 border border-border/50">
                <p className="content-wrap text-sm whitespace-pre-wrap">{workLog.remarks}</p>
              </div>
            </div>
          )
        }
        <div className="flex justify-end pt-1">
          <Button type="button" variant="outline" size="sm" onClick={() => onClick(workLog)}>
            ดูรายละเอียด
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

