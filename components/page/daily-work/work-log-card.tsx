'use client'

import { useId, useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Clock, MessageSquareText } from 'lucide-react'
import { formatUiDate } from '@/lib/display-date'
import { formatHours } from '@/lib/decimal-hours'
import { WorkLog } from './types'

type WorkLogCardProps = {
  workLog: WorkLog
  onClick: (workLog: WorkLog) => void
}

export function WorkLogCard({ workLog, onClick }: Readonly<WorkLogCardProps>) {
  const [showRemarks, setShowRemarks] = useState(false)
  const remarksId = useId()
  return (
    <Card data-work-log-card="" className="motion-card card-shadow gap-2 py-4">
      <CardHeader className="px-4 py-0">
        <div className="flex min-w-0 items-start justify-between gap-3">
          <div data-work-log-identity="" className="min-w-0 flex-1">
            <CardTitle className="line-clamp-1 text-xs font-medium text-muted-foreground" title={workLog.project?.name || 'ไม่มี Project'}>
              <span aria-hidden="true" className="mr-1.5 inline-block h-2 w-2 rounded-full" style={{ backgroundColor: workLog.project?.colorProject || 'var(--project-accent)' }} />
              {workLog.project?.name || 'ไม่มี Project'}
            </CardTitle>
            <p className="content-wrap mt-1 line-clamp-2 text-sm font-semibold leading-snug">{workLog.workItem?.title || 'ไม่มีงานที่เชื่อมโยง'}</p>
            <CardDescription className="mt-1 text-xs">{formatUiDate(workLog.date)}</CardDescription>
          </div>
          <Badge variant="outline" className="max-w-[40%] shrink-0 items-start gap-1 whitespace-normal text-right">
            <Clock aria-hidden="true" className="mt-0.5 h-3 w-3 shrink-0" />
            <span data-work-log-hours="" className="content-wrap min-w-0 tabular-nums">{formatHours(workLog.hours)} ชม.</span>
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-2 px-4 py-0">
        {workLog.description && <p className="content-wrap line-clamp-2 whitespace-pre-wrap text-sm text-muted-foreground">{workLog.description}</p>}
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          {workLog.workItem && <Badge variant="outline" className="text-xs">{workLog.workItem.kind}</Badge>}
          {workLog.status && <Badge variant="secondary" className="text-xs">{workLog.status}</Badge>}
          <div className="ml-auto flex flex-wrap items-center gap-2">
            {workLog.remarks && <Button type="button" variant="ghost" size="sm" className="h-9 px-2 text-xs" aria-expanded={showRemarks} aria-controls={remarksId} onClick={() => setShowRemarks(!showRemarks)}>
              <MessageSquareText aria-hidden="true" className="h-3.5 w-3.5" />
              {showRemarks ? 'ซ่อนหมายเหตุ' : 'หมายเหตุ'}
            </Button>}
            <Button type="button" variant="outline" size="sm" className="h-9 px-2 text-xs" onClick={() => onClick(workLog)}>ดูรายละเอียด</Button>
          </div>
        </div>
        {workLog.remarks && showRemarks && <div id={remarksId} className="rounded-lg border border-border/60 bg-muted/20 p-3">
          <p className="content-wrap whitespace-pre-wrap text-sm">{workLog.remarks}</p>
        </div>}
      </CardContent>
    </Card>
  )
}
