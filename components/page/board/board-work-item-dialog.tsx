'use client'

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  WORK_ITEM_PRIORITY_LABELS,
  WORK_ITEM_ROLE_LABELS,
  WORK_ITEM_STATUS_LABELS,
} from '@/lib/work-items'
import type { WorkItem } from '@/components/page/work-items/types'
import { WorkItemDescription } from '@/components/page/work-items/work-item-description'
import { kindClass, priorityClass, statusClass } from '@/components/page/work-items/work-item-presentation'
import { formatBoardCalendarDate } from '@/components/page/board/board-workflow'

type BoardWorkItemDialogProps = {
  item: WorkItem | null
  onOpenChange: (open: boolean) => void
}

export function BoardWorkItemDialog({ item, onOpenChange }: Readonly<BoardWorkItemDialogProps>) {
  return (
    <Dialog open={Boolean(item)} onOpenChange={onOpenChange}>
      {item && (
        <DialogContent className="flex max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-2xl flex-col gap-0 overflow-hidden p-0">
          <DialogHeader className="shrink-0 space-y-3 border-b border-border/60 px-4 py-4 text-left sm:px-6">
            <div className="flex min-w-0 flex-wrap items-start gap-2">
              <DialogTitle className="min-w-0 text-lg leading-snug sm:text-xl">{item.title}</DialogTitle>
              <Badge variant="outline" className={kindClass(item.kind)}>{item.kind}</Badge>
            </div>
            <DialogDescription>
              {item.project.name}{item.project.company?.name ? ` · ${item.project.company.name}` : ''}
            </DialogDescription>
            <div className="flex flex-wrap gap-2">
              <Badge variant="outline" className={statusClass(item.status)}>
                {WORK_ITEM_STATUS_LABELS[item.status]}
              </Badge>
              <Badge variant="outline" className={priorityClass(item.priority)}>
                {WORK_ITEM_PRIORITY_LABELS[item.priority]}
              </Badge>
              {item.role && <Badge variant="secondary">{WORK_ITEM_ROLE_LABELS[item.role]}</Badge>}
            </div>
          </DialogHeader>
          <section className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6">
            <h2 className="mb-2 text-sm font-semibold">รายละเอียด</h2>
            {item.description
              ? <WorkItemDescription text={item.description} className="break-words" />
              : <p className="text-sm italic text-muted-foreground">ไม่มีรายละเอียด</p>}
          </section>
          <div className="grid shrink-0 grid-cols-2 gap-3 border-t border-border/60 bg-muted/20 px-4 py-3 text-sm sm:grid-cols-3 sm:px-6">
            <div>
              <p className="text-xs text-muted-foreground">Work date</p>
              <time dateTime={item.workDate ?? undefined}>{formatBoardCalendarDate(item.workDate)}</time>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Due date · Asia/Bangkok</p>
              <time dateTime={item.dueDate ?? undefined}>{formatBoardCalendarDate(item.dueDate)}</time>
            </div>
            <div className="col-span-2 sm:col-span-1">
              <p className="text-xs text-muted-foreground">Assignee</p>
              <span>{item.assignee.name}</span>
            </div>
          </div>
          <DialogFooter className="shrink-0 border-t border-border/60 px-4 py-3 sm:px-6">
            <Button variant="outline" onClick={() => onOpenChange(false)}>ปิด</Button>
          </DialogFooter>
        </DialogContent>
      )}
    </Dialog>
  )
}
