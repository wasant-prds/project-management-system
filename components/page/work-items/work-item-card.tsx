'use client'

import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Calendar, Flag, MoreVertical } from 'lucide-react'
import {
  WORK_ITEM_PRIORITY_LABELS,
  WORK_ITEM_ROLE_LABELS,
  WORK_ITEM_STATUS_LABELS,
} from '@/lib/work-items'
import type { WorkItem } from './types'
import { ProjectIdentity } from './project-identity'
import {
  descriptionPreview,
  formatDisplayDate,
  kindClass,
  priorityClass,
  projectAccentStyle,
  statusClass,
} from './work-item-presentation'

type WorkItemCardProps = {
  item: WorkItem
  onView: (item: WorkItem) => void
  onEdit: (item: WorkItem) => void
  onDelete: (item: WorkItem) => void
}

export function WorkItemCard({ item, onView, onEdit, onDelete }: Readonly<WorkItemCardProps>) {
  const accent = projectAccentStyle(item.project.colorProject)
  const preview = item.description ? descriptionPreview(item.description) : ''

  return (
    <Card
      className="card-shadow relative cursor-pointer gap-0 overflow-hidden py-0 transition-all duration-200 hover:-translate-y-px hover:shadow-md"
      onClick={() => onView(item)}
    >
      <span
        aria-hidden
        className="absolute inset-y-0 left-0 w-[3px]"
        style={{ backgroundColor: accent.color }}
      />
      <ProjectIdentity
        name={item.project.name}
        color={item.project.colorProject}
        showRail={false}
        className="pl-5"
      />

      <CardContent className="space-y-3 p-4 pl-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1 space-y-2.5">
            <div className="flex items-start gap-2">
              <h3 className="min-w-0 flex-1 text-[15px] font-semibold leading-snug text-foreground">
                {item.title}
              </h3>
              <Badge variant="outline" className={`shrink-0 ${kindClass(item.kind)}`}>
                {item.kind}
              </Badge>
            </div>

            {preview && (
              <p className="line-clamp-2 text-sm leading-relaxed text-muted-foreground">{preview}</p>
            )}

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
              <span className="hidden h-3 w-px bg-border sm:block" />
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Calendar className="h-3 w-3" />
                <span>Due {formatDisplayDate(item.dueDate)}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <Avatar className="h-5 w-5 border border-primary/20">
                  <AvatarFallback className="bg-primary/10 text-[10px] text-primary">
                    {(item.assignee.avatar || item.assignee.name).slice(0, 2)}
                  </AvatarFallback>
                </Avatar>
                <span className="text-xs text-muted-foreground">{item.assignee.name}</span>
              </div>
            </div>
          </div>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 shrink-0"
                onClick={(event) => event.stopPropagation()}
              >
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" onClick={(event) => event.stopPropagation()}>
              <DropdownMenuLabel>Actions</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => onView(item)}>View</DropdownMenuItem>
              <DropdownMenuItem onClick={() => onEdit(item)}>Edit</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem className="text-destructive" onClick={() => onDelete(item)}>
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </CardContent>
    </Card>
  )
}
