'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { ChevronRight } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { cn } from '@/lib/utils'
import { WorkItemCard } from './work-item-card'
import { ProjectIdentity } from './project-identity'
import type { UrgencySubgroup, WorkItemProjectGroup, WorkItemUrgencyBucket } from './work-item-export'
import type { WorkItem } from './types'

const URGENCY_SUBGROUP_BAR_CLASS: Record<UrgencySubgroup, string> = {
  overdue: 'border-l-4 border-red-500 bg-red-500/15 text-red-800 dark:text-red-300',
  'near-due': 'border-l-4 border-amber-500 bg-amber-500/15 text-amber-800 dark:text-amber-300',
  'on-track': 'border-l-4 border-blue-500 bg-blue-500/15 text-blue-800 dark:text-blue-300',
  complete: 'border-l-4 border-emerald-500 bg-emerald-500/15 text-emerald-800 dark:text-emerald-300',
}

type WorkItemGroupedListProps = {
  groups: WorkItemProjectGroup[]
  resetKey: string
  onView: (item: WorkItem) => void
  onEdit: (item: WorkItem) => void
  onDelete: (item: WorkItem) => void
}

function subgroupExpandKey(projectId: string, subgroupKey: UrgencySubgroup) {
  return `${projectId}:${subgroupKey}`
}

function projectItemCount(group: WorkItemProjectGroup) {
  return group.subgroups.reduce((sum, subgroup) => sum + subgroup.items.length, 0)
}

function defaultExpandedKeys(groups: WorkItemProjectGroup[]) {
  const first = groups[0]
  if (!first) return { projects: new Set<string>(), subgroups: new Set<string>() }
  const firstSub = first.subgroups[0]
  const subgroups = new Set<string>()
  if (firstSub) subgroups.add(subgroupExpandKey(first.projectId, firstSub.key))
  return { projects: new Set([first.projectId]), subgroups }
}

function TreeNode({ isLast, children }: Readonly<{ isLast: boolean; children: ReactNode }>) {
  return (
    <div className="flex min-w-0">
      <span aria-hidden className="flex w-4 shrink-0 flex-col sm:w-5">
        <span className="relative h-8 w-full shrink-0">
          <span
            className={cn(
              'absolute left-1/2 w-px -translate-x-1/2 bg-border',
              isLast ? 'top-0 h-1/2' : 'inset-y-0',
            )}
          />
          <span className="absolute left-1/2 top-1/2 h-px w-1/2 bg-border" />
        </span>
        {!isLast && <span className="mx-auto w-px min-h-0 flex-1 bg-border" />}
      </span>
      <div className="min-w-0 flex-1 pb-1">{children}</div>
    </div>
  )
}

function SubgroupBranch({
  subgroup,
  isLast,
  open,
  onOpenChange,
  onView,
  onEdit,
  onDelete,
}: Readonly<{
  subgroup: WorkItemUrgencyBucket
  isLast: boolean
  open: boolean
  onOpenChange: (open: boolean) => void
  onView: (item: WorkItem) => void
  onEdit: (item: WorkItem) => void
  onDelete: (item: WorkItem) => void
}>) {
  return (
    <TreeNode isLast={isLast}>
      <Collapsible open={open} onOpenChange={onOpenChange}>
        <CollapsibleTrigger asChild>
          <button
            type="button"
            className={cn(
              'flex h-8 w-full items-center gap-1.5 rounded-md px-2 text-left text-[11px] font-semibold uppercase tracking-[0.12em]',
              URGENCY_SUBGROUP_BAR_CLASS[subgroup.key],
            )}
          >
            <ChevronRight
              className={cn('h-3.5 w-3.5 shrink-0 transition-transform', open && 'rotate-90')}
            />
            <span className="min-w-0 truncate">{subgroup.label}</span>
            <span className="ml-auto shrink-0 font-medium tabular-nums opacity-80">
              {subgroup.items.length}
            </span>
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="pt-1">
            {subgroup.items.map((item, index) => (
              <TreeNode key={item.id} isLast={index === subgroup.items.length - 1}>
                <WorkItemCard
                  item={item}
                  compact
                  showProjectIdentity={false}
                  onView={onView}
                  onEdit={onEdit}
                  onDelete={onDelete}
                />
              </TreeNode>
            ))}
          </div>
        </CollapsibleContent>
      </Collapsible>
    </TreeNode>
  )
}

function ProjectBranch({
  group,
  open,
  expandedSubgroups,
  onProjectOpenChange,
  onSubgroupOpenChange,
  onView,
  onEdit,
  onDelete,
}: Readonly<{
  group: WorkItemProjectGroup
  open: boolean
  expandedSubgroups: ReadonlySet<string>
  onProjectOpenChange: (open: boolean) => void
  onSubgroupOpenChange: (subgroupKey: UrgencySubgroup, open: boolean) => void
  onView: (item: WorkItem) => void
  onEdit: (item: WorkItem) => void
  onDelete: (item: WorkItem) => void
}>) {
  const count = projectItemCount(group)

  return (
    <section>
      <Collapsible open={open} onOpenChange={onProjectOpenChange}>
        <div className="overflow-hidden rounded-xl border border-border/70 bg-card">
          <CollapsibleTrigger asChild>
            <button type="button" className="flex w-full items-stretch text-left">
              <span className="flex w-9 shrink-0 items-center justify-center text-muted-foreground">
                <ChevronRight
                  className={cn('h-4 w-4 transition-transform', open && 'rotate-90')}
                />
              </span>
              <ProjectIdentity
                name={group.projectName}
                color={group.projectColor}
                size="md"
                className="min-w-0 flex-1 border-b-0 px-3 py-2.5 pr-2"
              />
              <span className="flex shrink-0 items-center pr-3 text-xs tabular-nums text-muted-foreground">
                {count}
              </span>
            </button>
          </CollapsibleTrigger>
        </div>
        <CollapsibleContent>
          <div className="ml-1 pt-1">
            {group.subgroups.map((subgroup, index) => (
              <SubgroupBranch
                key={subgroup.key}
                subgroup={subgroup}
                isLast={index === group.subgroups.length - 1}
                open={expandedSubgroups.has(subgroupExpandKey(group.projectId, subgroup.key))}
                onOpenChange={(next) => onSubgroupOpenChange(subgroup.key, next)}
                onView={onView}
                onEdit={onEdit}
                onDelete={onDelete}
              />
            ))}
          </div>
        </CollapsibleContent>
      </Collapsible>
    </section>
  )
}

export function WorkItemGroupedList({
  groups,
  resetKey,
  onView,
  onEdit,
  onDelete,
}: Readonly<WorkItemGroupedListProps>) {
  const [expandedProjects, setExpandedProjects] = useState<Set<string>>(() => defaultExpandedKeys(groups).projects)
  const [expandedSubgroups, setExpandedSubgroups] = useState<Set<string>>(
    () => defaultExpandedKeys(groups).subgroups,
  )
  const groupsRef = useRef(groups)
  groupsRef.current = groups

  const firstProjectId = groups[0]?.projectId ?? ''
  const firstSubgroupKey = groups[0]?.subgroups[0]?.key ?? ''

  useEffect(() => {
    const next = defaultExpandedKeys(groupsRef.current)
    setExpandedProjects(next.projects)
    setExpandedSubgroups(next.subgroups)
  }, [resetKey, firstProjectId, firstSubgroupKey])

  if (groups.length === 0) {
    return (
      <Card className="card-shadow">
        <CardContent className="py-12 text-center text-muted-foreground">
          No work items match the current filters.
        </CardContent>
      </Card>
    )
  }

  const handleProjectOpenChange = (group: WorkItemProjectGroup, open: boolean) => {
    setExpandedProjects((prev) => {
      const next = new Set(prev)
      if (open) next.add(group.projectId)
      else next.delete(group.projectId)
      return next
    })
    const firstSub = group.subgroups[0]
    if (open && firstSub) {
      setExpandedSubgroups((prev) => {
        const next = new Set(prev)
        next.add(subgroupExpandKey(group.projectId, firstSub.key))
        return next
      })
    }
  }

  const handleSubgroupOpenChange = (
    projectId: string,
    subgroupKey: UrgencySubgroup,
    open: boolean,
  ) => {
    setExpandedSubgroups((prev) => {
      const next = new Set(prev)
      const key = subgroupExpandKey(projectId, subgroupKey)
      if (open) next.add(key)
      else next.delete(key)
      return next
    })
  }

  return (
    <div className="space-y-4">
      {groups.map((group) => (
        <ProjectBranch
          key={group.projectId}
          group={group}
          open={expandedProjects.has(group.projectId)}
          expandedSubgroups={expandedSubgroups}
          onProjectOpenChange={(open) => handleProjectOpenChange(group, open)}
          onSubgroupOpenChange={(subgroupKey, open) => {
            handleSubgroupOpenChange(group.projectId, subgroupKey, open)
          }}
          onView={onView}
          onEdit={onEdit}
          onDelete={onDelete}
        />
      ))}
    </div>
  )
}
