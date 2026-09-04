'use client'

import type { ReactNode } from 'react'
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
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Calendar, FileText, Flag } from 'lucide-react'
import {
  WORK_ITEM_PRIORITY_LABELS,
  WORK_ITEM_ROLE_LABELS,
  WORK_ITEM_STATUS_LABELS,
} from '@/lib/work-items'
import { WorkItemDescription } from './work-item-description'
import { ProjectIdentity } from './project-identity'
import { ScrollablePanel } from '@/components/ui/scrollable-panel'
import { WORK_ITEM_DIALOG_SHELL_CLASS } from './work-item-dialog-shell'
import type { WorkItem } from './types'
import {
  formatDisplayDate,
  kindClass,
  priorityClass,
  statusClass,
} from './work-item-presentation'

type WorkItemViewDialogProps = {
  open: boolean
  item: WorkItem | null
  onOpenChange: (open: boolean) => void
  onEdit: (item: WorkItem) => void
}

function Detail({ label, children }: Readonly<{ label: string; children: ReactNode }>) {
  return (
    <div className="min-w-0 flex-1 space-y-1 sm:min-w-[8rem]">
      <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">{label}</p>
      <div className="min-w-0 text-sm font-medium text-foreground">{children}</div>
    </div>
  )
}

export function WorkItemViewDialog({
  open,
  item,
  onOpenChange,
  onEdit,
}: Readonly<WorkItemViewDialogProps>) {
  if (!item) return null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={WORK_ITEM_DIALOG_SHELL_CLASS}>
        <div className="shrink-0">
          <ProjectIdentity
            name={item.project.name}
            color={item.project.colorProject}
            size="md"
            className="px-4 py-3 pr-12 sm:px-6 sm:py-3.5"
          />
        </div>

        <div className="shrink-0 space-y-3 px-4 pt-4 sm:px-6 sm:pt-5">
          <DialogHeader className="space-y-2">
            <div className="flex min-w-0 flex-wrap items-start gap-2">
              <DialogTitle className="min-w-0 text-left text-lg leading-snug tracking-tight sm:text-xl">
                {item.title}
              </DialogTitle>
              <Badge variant="outline" className={kindClass(item.kind)}>{item.kind}</Badge>
            </div>
            <DialogDescription className="sr-only">Work item details</DialogDescription>
          </DialogHeader>

          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className={statusClass(item.status)}>
              {WORK_ITEM_STATUS_LABELS[item.status]}
            </Badge>
            <Badge variant="outline" className={priorityClass(item.priority)}>
              <Flag className="mr-1 h-3 w-3" />
              {WORK_ITEM_PRIORITY_LABELS[item.priority]}
            </Badge>
            {item.role && (
              <Badge variant="outline">{WORK_ITEM_ROLE_LABELS[item.role]}</Badge>
            )}
            {item.types.map((type) => (
              <Badge key={type} variant="secondary">{type}</Badge>
            ))}
          </div>
        </div>

        <section className="flex min-h-0 flex-1 flex-col overflow-hidden px-4 py-3 sm:px-6 sm:py-4">
          <div className="mb-2 flex shrink-0 items-center gap-2 text-muted-foreground">
            <FileText className="h-3.5 w-3.5" />
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em]">Details</p>
          </div>
          <ScrollablePanel className="min-h-[8rem] min-w-0 flex-1 rounded-xl border border-border/70 bg-muted/30 shadow-inner">
            {item.description ? (
              <WorkItemDescription
                text={item.description}
                className="rounded-none border-0 bg-transparent px-4 py-3 break-words"
              />
            ) : (
              <p className="px-4 py-6 text-sm italic text-muted-foreground">No description</p>
            )}
          </ScrollablePanel>
        </section>

        <div className="grid shrink-0 grid-cols-2 gap-x-4 gap-y-3 border-t border-border/60 bg-muted/20 px-4 py-3 sm:flex sm:flex-wrap sm:gap-x-6 sm:px-6">
          <Detail label="Assignee">
            <div className="flex min-w-0 items-center gap-2">
              <Avatar className="h-6 w-6 shrink-0 border border-primary/20">
                <AvatarFallback className="bg-primary/10 text-xs text-primary">
                  {(item.assignee.avatar || item.assignee.name).slice(0, 2)}
                </AvatarFallback>
              </Avatar>
              <span className="min-w-0 truncate">{item.assignee.name}</span>
            </div>
          </Detail>
          <Detail label="Work date">{formatDisplayDate(item.workDate)}</Detail>
          <Detail label="Due date">
            <span className="inline-flex items-center gap-1.5">
              <Calendar className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              {formatDisplayDate(item.dueDate)}
            </span>
          </Detail>
          <Detail label="Submitted">{formatDisplayDate(item.submittedAt)}</Detail>
        </div>

        <DialogFooter className="shrink-0 flex-row justify-end border-t border-border/60 px-4 py-3 sm:px-6 sm:py-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
          <Button onClick={() => onEdit(item)}>Edit</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
