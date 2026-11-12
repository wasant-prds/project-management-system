'use client'

import type { ReactNode } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Calendar, ExternalLink, FileText, Flag } from 'lucide-react'
import {
  WORK_ITEM_PRIORITY_LABELS,
  WORK_ITEM_ROLE_LABELS,
  workItemTypeLabel,
} from '@/lib/work-items'
import { WorkItemDescription } from './work-item-description'
import { ProjectIdentity } from './project-identity'
import { WORK_ITEM_DIALOG_SHELL_CLASS } from './work-item-dialog-shell'
import type { WorkItem, WorkItemTimeEntry } from './types'
import { formatHours, sumDecimalHours } from '@/lib/decimal-hours'
import { formatUiDate } from '@/lib/display-date'
import {
  kindClass,
  priorityClass,
} from './work-item-presentation'
import { WorkItemStatusBadge } from './work-item-status-badge'

type WorkItemViewDialogProps = {
  open: boolean
  item: WorkItem | null
  isLoading?: boolean
  onOpenChange: (open: boolean) => void
  onEdit: (item: WorkItem) => void
}

function Detail({ label, children }: Readonly<{ label: string; children: ReactNode }>) {
  return (
    <div className="min-w-0 space-y-1">
      <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">{label}</p>
      <div className="min-w-0 text-sm font-medium text-foreground">{children}</div>
    </div>
  )
}

function DailyWorkEntries({ isLoading, entries }: Readonly<{
  isLoading: boolean
  entries: WorkItemTimeEntry[] | undefined
}>) {
  if (isLoading) return <output className="block text-sm text-muted-foreground">กำลังโหลด Daily Work...</output>
  if (!entries || entries.length === 0) {
    return <p className="text-sm italic text-muted-foreground">ยังไม่มี Daily Work ที่ผูกกับ Work Item นี้</p>
  }

  const totalHours = sumDecimalHours(entries.map((entry) => entry.hours))

  return (
    <ul className="space-y-2">
      <li className="flex items-center justify-between border-b border-border/50 pb-2 text-sm">
        <span className="text-muted-foreground">Total logged</span>
        <strong className="tabular-nums">{formatHours(totalHours)} h</strong>
      </li>
      {entries.map((entry) => (
        <li key={entry.id} className="rounded-md border border-border/60 bg-background/70 px-3 py-2 text-sm">
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
            <time dateTime={entry.date}>{formatUiDate(entry.date)}</time>
            <span className="font-medium tabular-nums">{formatHours(entry.hours)} h</span>
          </div>
          {(entry.description || entry.remarks) && (
            <p className="content-wrap mt-1 whitespace-pre-wrap text-muted-foreground">
              {[entry.description, entry.remarks].filter(Boolean).join(' · ')}
            </p>
          )}
        </li>
      ))}
    </ul>
  )
}

export function WorkItemViewDialog({
  open,
  item,
  isLoading = false,
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
            size="sm"
            className="px-4 py-2 pr-12 sm:px-6 sm:pr-12"
          />
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 sm:px-6">
          <div className="flex min-h-full min-w-0 flex-col gap-4">
            <div className="space-y-2">
              {item.project.company && (
                <p className="content-wrap text-xs text-muted-foreground">
                  Company: {item.project.company.displayName
                    ? `${item.project.company.displayName} — ${item.project.company.name}`
                    : item.project.company.name}
                </p>
              )}
              <div className="flex min-w-0 flex-wrap items-start gap-2">
                <DialogTitle className="min-w-0 text-left text-lg leading-snug tracking-tight sm:text-xl">
                  {item.title}
                </DialogTitle>
                <Badge variant="outline" className={kindClass(item.kind)}>{item.kind}</Badge>
              </div>
              <DialogDescription className="sr-only">Work item details</DialogDescription>

              <div className="flex flex-wrap items-center gap-2">
                <WorkItemStatusBadge status={item.status} />
                <Badge variant="outline" className={priorityClass(item.priority)}>
                  <Flag className="mr-1 h-3 w-3" />
                  {WORK_ITEM_PRIORITY_LABELS[item.priority]}
                </Badge>
                {item.role && (
                  <Badge variant="outline">{WORK_ITEM_ROLE_LABELS[item.role]}</Badge>
                )}
                {item.types.map((type) => (
                  <Badge key={type} variant="secondary">{workItemTypeLabel(type)}</Badge>
                ))}
              </div>
              {item.source && (
                <a
                  href={item.source.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex max-w-full items-center gap-1.5 text-sm text-link underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  aria-label={`Open ${item.source.provider === 'github' ? 'GitHub' : 'GitLab'} Issue ${item.source.issueIid}`}
                >
                  <ExternalLink className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">{item.source.provider === 'github' ? 'GitHub' : 'GitLab'} Issue #{item.source.issueIid}</span>
                </a>
              )}
              {item.source?.inScope === false && <p className="text-sm text-muted-foreground">อยู่นอก assignee filter — เก็บข้อมูลเดิมและหยุดอัปเดตจากต้นทาง</p>}
            </div>

            <section aria-labelledby="work-item-details-heading" className="flex min-w-0 flex-1 flex-col">
              <div className="mb-2 flex shrink-0 items-center gap-2">
                <FileText className="h-4 w-4 text-primary" />
                <h2 id="work-item-details-heading" className="text-base font-semibold text-foreground">Details</h2>
              </div>
              <div className="min-h-64 min-w-0 flex-1 rounded-xl border border-primary/25 bg-muted/20">
                {item.description ? (
                  <WorkItemDescription
                    text={item.description}
                    className="content-wrap rounded-none border-0 bg-transparent px-4 py-3 text-base leading-relaxed text-foreground [&_h4]:text-base [&_h4]:normal-case [&_h4]:tracking-normal [&_table]:w-full [&_table]:min-w-[32rem] [&_table]:[overflow-wrap:normal] [&_th]:whitespace-nowrap [&_code]:text-sm"
                  />
                ) : (
                  <p className="px-4 py-6 text-sm italic text-muted-foreground">No description</p>
                )}
              </div>
            </section>

            <div className="grid grid-cols-2 gap-x-4 gap-y-3 rounded-lg border border-border/60 bg-muted/20 px-3 py-2.5 sm:grid-cols-4">
              <Detail label="Assignee">
                <div className="flex min-w-0 items-center gap-2">
                  <Avatar className="h-6 w-6 shrink-0 border border-primary/20">
                    <AvatarFallback className="bg-primary/10 text-xs text-link">
                      {(item.assignee.avatar || item.assignee.name).slice(0, 2)}
                    </AvatarFallback>
                  </Avatar>
                  <span className="content-wrap min-w-0">{item.assignee.name}</span>
                </div>
              </Detail>
              <Detail label="Work date">{formatUiDate(item.workDate)}</Detail>
              <Detail label="Due date">
                <span className="inline-flex flex-wrap items-center gap-1.5">
                  <Calendar className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  {formatUiDate(item.dueDate)}
                </span>
              </Detail>
              <Detail label="Submitted">{formatUiDate(item.submittedAt)}</Detail>
            </div>

            <section className="space-y-2 border-t border-border/60 pt-3" aria-label="Daily Work">
              <div className="flex items-center justify-between gap-3">
                <h2 className="type-card-title">Daily Work</h2>
                {!isLoading && <span className="text-xs text-muted-foreground">{item.timeEntries?.length ?? 0} entries</span>}
              </div>
              <DailyWorkEntries isLoading={isLoading} entries={item.timeEntries} />
            </section>
          </div>
        </div>

        <DialogFooter className="shrink-0 flex-row justify-end border-t border-border/60 px-4 py-3 data-[slot=dialog-footer]:pt-3 sm:px-6">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
          <Button onClick={() => onEdit(item)}>Edit</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
