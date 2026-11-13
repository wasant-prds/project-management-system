'use client'

import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Calendar, MoreVertical } from 'lucide-react'
import {
  WORK_ITEM_PRIORITY_LABELS,
  WORK_ITEM_ROLE_LABELS,
  workItemTypeLabel,
} from '@/lib/work-items'
import { cn } from '@/lib/utils'
import { formatUiDate } from '@/lib/display-date'
import type { WorkItem } from './types'
import { ProjectIdentity } from './project-identity'
import {
  descriptionPreview,
  projectAccentStyle,
} from './work-item-presentation'
import { WorkItemStatusBadge } from './work-item-status-badge'

type WorkItemCardProps = {
  item: WorkItem
  onView: (item: WorkItem) => void
  onEdit: (item: WorkItem) => void
  onDelete: (item: WorkItem) => void
  showProjectIdentity?: boolean
  compact?: boolean
}

export function WorkItemCard({
  item,
  onView,
  onEdit,
  onDelete,
  showProjectIdentity = true,
  compact = false,
}: Readonly<WorkItemCardProps>) {
  const accent = projectAccentStyle(item.project.colorProject)
  const previewMaxLength = compact ? 120 : 180
  const preview = item.description ? descriptionPreview(item.description, previewMaxLength) : ''
  const secondary = [item.assignee.name, item.role ? WORK_ITEM_ROLE_LABELS[item.role] : '', ...item.types.map(workItemTypeLabel)].filter(Boolean).join(' · ')

  return (
    <Card
      data-spatial="pointer"
      data-work-item-card={item.id}
      className="cinematic-pointer motion-card relative min-w-0 cursor-pointer gap-0 overflow-hidden py-0 shadow-none hover:border-primary/30"
      onClick={() => onView(item)}
    >
      <span
        aria-hidden
        className="absolute inset-y-0 left-0 w-[3px]"
        style={{ backgroundColor: accent.color }}
      />
      {showProjectIdentity && (
        <ProjectIdentity
          name={item.project.name}
          color={item.project.colorProject}
          showRail={false}
          className="pl-5"
        />
      )}

      <CardContent className={cn('relative min-w-0 space-y-1.5', compact ? 'p-2.5 pl-3.5' : 'p-3 pl-4')}>
        <button type="button" className="block w-full min-w-0 rounded-sm pr-9 text-left hover:text-link focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-haspopup="dialog" onClick={(event) => { event.stopPropagation(); onView(item) }}>
          <h3 className={cn('content-wrap min-w-0 font-semibold leading-snug text-foreground line-clamp-2', compact ? 'text-sm' : 'text-[15px]')}>
            {item.title}
          </h3>
        </button>
        {preview && <p className="content-wrap line-clamp-1 text-xs leading-relaxed text-muted-foreground">{preview}</p>}

        <div className="flex min-h-6 min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
          <WorkItemStatusBadge status={item.status} />
          <div className="flex min-w-0 items-center gap-1 text-xs font-medium text-foreground">
            <Calendar aria-hidden className="h-3 w-3 shrink-0 text-muted-foreground" />
            <span>กำหนดส่ง {formatUiDate(item.dueDate)}</span>
          </div>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="absolute right-1 top-1 size-9 shrink-0"
              aria-label={`จัดการ Work Item ${item.title}`}
              onClick={(event) => event.stopPropagation()}
            >
              <MoreVertical className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" onClick={(event) => event.stopPropagation()}>
            <DropdownMenuLabel>จัดการ Work Item</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => onView(item)}>ดูรายละเอียด</DropdownMenuItem>
            <DropdownMenuItem onClick={() => onEdit(item)}>แก้ไข</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="text-danger" onClick={() => onDelete(item)}>ลบ</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <div className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
          <Badge variant="secondary" className="shrink-0 font-normal">{item.kind}</Badge>
          <span className="shrink-0">{WORK_ITEM_PRIORITY_LABELS[item.priority]}</span>
          <span className="min-w-0 truncate" title={secondary}>{secondary}</span>
        </div>
      </CardContent>
    </Card>
  )
}
