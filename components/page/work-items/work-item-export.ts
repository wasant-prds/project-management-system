import {
  WORK_ITEM_PRIORITY_LABELS,
  WORK_ITEM_ROLE_LABELS,
  WORK_ITEM_STATUS_LABELS,
} from '@/lib/work-items'
import { formatDisplayDate } from './work-item-presentation'
import type { WorkItem } from './types'

export const DEFAULT_WORK_ITEM_SORT_MODE = 'recent-activity' as const

export const WORK_ITEM_SORT_MODES = [
  'recent-activity',
  'due-asc',
  'due-desc',
  'project-title-asc',
  'project-title-desc',
] as const
export type WorkItemSortMode = (typeof WORK_ITEM_SORT_MODES)[number]

export const WORK_ITEM_HOVER_SORT_MODES = [
  'due-asc',
  'due-desc',
  'project-title-asc',
  'project-title-desc',
] as const

export const WORK_ITEM_SORT_LABELS: Record<WorkItemSortMode, string> = {
  'recent-activity': 'Recent activity',
  'due-asc': 'Due date ↑',
  'due-desc': 'Due date ↓',
  'project-title-asc': 'Project title A–Z',
  'project-title-desc': 'Project title Z–A',
}

export const URGENCY_SUBGROUPS = ['overdue', 'near-due', 'on-track', 'complete'] as const
export type UrgencySubgroup = (typeof URGENCY_SUBGROUPS)[number]

export const URGENCY_SUBGROUP_LABELS: Record<UrgencySubgroup, string> = {
  overdue: 'Overdue',
  'near-due': 'Near due',
  'on-track': 'On track',
  complete: 'Complete',
}

export type WorkItemUrgencyBucket = {
  key: UrgencySubgroup
  label: string
  items: WorkItem[]
}

export type WorkItemProjectGroup = {
  projectId: string
  projectName: string
  projectColor: string | null
  subgroups: WorkItemUrgencyBucket[]
}

const CSV_HEADER = [
  'Project',
  'Title',
  'Kind',
  'Status',
  'Priority',
  'Role',
  'Types',
  'Description',
  'Assignee',
  'Work Date',
  'Due Date',
  'Submitted',
].join(',')

const EMPTY = '—'
const SORT_MODE_SET: ReadonlySet<string> = new Set(WORK_ITEM_SORT_MODES)

type DateParts = { y: number; m: number; d: number }

export function isWorkItemSortMode(value: string): value is WorkItemSortMode {
  return SORT_MODE_SET.has(value)
}

function compareText(left: string, right: string) {
  return left.localeCompare(right, undefined, { sensitivity: 'base', numeric: true })
}

function parseIsoDateParts(value: string | null | undefined): DateParts | null {
  if (!value || value.length < 10 || value[4] !== '-' || value[7] !== '-') return null
  const y = Number(value.slice(0, 4))
  const m = Number(value.slice(5, 7))
  const d = Number(value.slice(8, 10))
  if (!Number.isInteger(y) || !Number.isInteger(m) || !Number.isInteger(d)) return null
  if (m < 1 || m > 12 || d < 1 || d > 31) return null
  return { y, m, d }
}

function localDateParts(date: Date): DateParts {
  return { y: date.getFullYear(), m: date.getMonth() + 1, d: date.getDate() }
}

function ymdValue(parts: DateParts): number {
  return parts.y * 10000 + parts.m * 100 + parts.d
}

function compareDateParts(left: DateParts, right: DateParts) {
  return ymdValue(left) - ymdValue(right)
}

function isFinished(item: WorkItem) {
  return item.status === 'completed' || item.status === 'cancelled'
}

export function urgencySubgroup(item: WorkItem, today = new Date()): UrgencySubgroup {
  if (isFinished(item)) return 'complete'
  const due = parseIsoDateParts(item.dueDate)
  if (!due) return 'on-track'
  const now = localDateParts(today)
  if (compareDateParts(due, now) < 0) return 'overdue'
  if (due.y === now.y && due.m === now.m) return 'near-due'
  return 'on-track'
}

function dueSortValue(item: WorkItem): number | null {
  const parts = parseIsoDateParts(item.dueDate)
  return parts ? ymdValue(parts) : null
}

function updatedTimestamp(item: WorkItem): number {
  if (!item.updatedAt) return 0
  const value = new Date(item.updatedAt).getTime()
  return Number.isNaN(value) ? 0 : value
}

function compareByDueDate(left: WorkItem, right: WorkItem, direction: 'asc' | 'desc') {
  const leftDue = dueSortValue(left)
  const rightDue = dueSortValue(right)
  if (leftDue === null && rightDue === null) return compareText(left.title, right.title)
  if (leftDue === null) return 1
  if (rightDue === null) return -1
  const diff = direction === 'asc' ? leftDue - rightDue : rightDue - leftDue
  if (diff !== 0) return diff
  return compareText(left.title, right.title)
}

function compareByUpdatedAt(left: WorkItem, right: WorkItem) {
  const diff = updatedTimestamp(right) - updatedTimestamp(left)
  if (diff !== 0) return diff
  return compareText(left.title, right.title)
}

function compareSubgroupItems(
  left: WorkItem,
  right: WorkItem,
  key: UrgencySubgroup,
  mode: WorkItemSortMode,
) {
  if (key === 'complete') return compareText(left.title, right.title)
  if (mode === 'due-asc') return compareByDueDate(left, right, 'asc')
  if (mode === 'due-desc') return compareByDueDate(left, right, 'desc')
  if (key === 'overdue' || key === 'near-due') return compareByDueDate(left, right, 'asc')
  return compareByUpdatedAt(left, right)
}

function collectByProject(items: WorkItem[]): Map<string, WorkItem[]> {
  const grouped = new Map<string, WorkItem[]>()
  for (const item of items) {
    const existing = grouped.get(item.project.id)
    if (existing) existing.push(item)
    else grouped.set(item.project.id, [item])
  }
  return grouped
}

function buildSubgroups(projectItems: WorkItem[], mode: WorkItemSortMode, today: Date) {
  const buckets: Record<UrgencySubgroup, WorkItem[]> = {
    overdue: [],
    'near-due': [],
    'on-track': [],
    complete: [],
  }
  for (const item of projectItems) {
    buckets[urgencySubgroup(item, today)].push(item)
  }

  const subgroups: WorkItemUrgencyBucket[] = []
  for (const key of URGENCY_SUBGROUPS) {
    const bucket = buckets[key]
    if (bucket.length === 0) continue
    bucket.sort((left, right) => compareSubgroupItems(left, right, key, mode))
    subgroups.push({ key, label: URGENCY_SUBGROUP_LABELS[key], items: bucket })
  }
  return subgroups
}

function buildProjectGroup(
  projectItems: WorkItem[],
  mode: WorkItemSortMode,
  today: Date,
): WorkItemProjectGroup | null {
  const first = projectItems[0]
  if (!first) return null
  return {
    projectId: first.project.id,
    projectName: first.project.name,
    projectColor: first.project.colorProject,
    subgroups: buildSubgroups(projectItems, mode, today),
  }
}

function flattenGroupItems(group: WorkItemProjectGroup): WorkItem[] {
  return group.subgroups.flatMap((subgroup) => subgroup.items)
}

function projectRecency(items: WorkItem[]): number {
  let latest = 0
  for (const item of items) {
    const stamp = updatedTimestamp(item)
    if (stamp > latest) latest = stamp
  }
  return latest
}

function projectDueValue(items: WorkItem[], direction: 'asc' | 'desc'): number | null {
  let best: number | null = null
  for (const item of items) {
    if (isFinished(item)) continue
    const due = dueSortValue(item)
    if (due === null) continue
    if (best === null) {
      best = due
      continue
    }
    if (direction === 'asc' && due < best) best = due
    if (direction === 'desc' && due > best) best = due
  }
  return best
}

function compareProjectDue(left: WorkItem[], right: WorkItem[], direction: 'asc' | 'desc') {
  const leftDue = projectDueValue(left, direction)
  const rightDue = projectDueValue(right, direction)
  if (leftDue === null && rightDue === null) return 0
  if (leftDue === null) return 1
  if (rightDue === null) return -1
  return direction === 'asc' ? leftDue - rightDue : rightDue - leftDue
}

function compareProjectGroups(
  left: WorkItemProjectGroup,
  right: WorkItemProjectGroup,
  mode: WorkItemSortMode,
) {
  if (mode === 'project-title-asc') return compareText(left.projectName, right.projectName)
  if (mode === 'project-title-desc') return compareText(right.projectName, left.projectName)

  const leftItems = flattenGroupItems(left)
  const rightItems = flattenGroupItems(right)

  if (mode === 'due-asc' || mode === 'due-desc') {
    const dueDiff = compareProjectDue(leftItems, rightItems, mode === 'due-asc' ? 'asc' : 'desc')
    if (dueDiff !== 0) return dueDiff
    return compareText(left.projectName, right.projectName)
  }

  const recency = projectRecency(rightItems) - projectRecency(leftItems)
  if (recency !== 0) return recency
  return compareText(left.projectName, right.projectName)
}

export function groupWorkItems(
  items: WorkItem[],
  mode: WorkItemSortMode,
  today = new Date(),
): WorkItemProjectGroup[] {
  const groups: WorkItemProjectGroup[] = []
  for (const projectItems of collectByProject(items).values()) {
    const group = buildProjectGroup(projectItems, mode, today)
    if (group) groups.push(group)
  }
  groups.sort((left, right) => compareProjectGroups(left, right, mode))
  return groups
}

export function flattenProjectGroups(groups: WorkItemProjectGroup[]): WorkItem[] {
  return groups.flatMap(flattenGroupItems)
}

function roleLabel(item: WorkItem) {
  return item.role ? WORK_ITEM_ROLE_LABELS[item.role] : EMPTY
}

function typesLabel(item: WorkItem) {
  return item.types.length > 0 ? item.types.join(', ') : EMPTY
}

function descriptionText(item: WorkItem) {
  return item.description?.trim() || 'No description'
}

function escapeCsvField(value: string) {
  return `"${value.replaceAll('"', '""')}"`
}

function generateCsvRow(item: WorkItem) {
  const fields = [
    item.project.name,
    item.title,
    item.kind,
    WORK_ITEM_STATUS_LABELS[item.status],
    WORK_ITEM_PRIORITY_LABELS[item.priority],
    roleLabel(item),
    typesLabel(item),
    descriptionText(item),
    item.assignee.name,
    formatDisplayDate(item.workDate),
    formatDisplayDate(item.dueDate),
    formatDisplayDate(item.submittedAt),
  ]
  return fields.map(escapeCsvField).join(',')
}

export function generateWorkItemsCsv(items: WorkItem[]) {
  return `\uFEFF${[CSV_HEADER, ...items.map(generateCsvRow)].join('\n')}`
}

function formatWorkItemMarkdown(item: WorkItem, includeProject: boolean) {
  const lines = [
    `### ${item.title}`,
    '',
    ...(includeProject ? [`- **Project:** ${item.project.name}`] : []),
    `- **Kind:** ${item.kind}`,
    `- **Status:** ${WORK_ITEM_STATUS_LABELS[item.status]}`,
    `- **Priority:** ${WORK_ITEM_PRIORITY_LABELS[item.priority]}`,
    `- **Role:** ${roleLabel(item)}`,
    `- **Types:** ${typesLabel(item)}`,
    `- **Assignee:** ${item.assignee.name}`,
    `- **Work date:** ${formatDisplayDate(item.workDate)}`,
    `- **Due date:** ${formatDisplayDate(item.dueDate)}`,
    `- **Submitted:** ${formatDisplayDate(item.submittedAt)}`,
    '',
    '**Description**',
    '',
    item.description?.trim() || '_No description_',
  ]
  return lines.join('\n')
}

function groupByProject(items: WorkItem[]): Array<[string, WorkItem[]]> {
  const grouped = new Map<string, WorkItem[]>()
  for (const item of items) {
    const name = item.project.name || 'No Project'
    const existing = grouped.get(name)
    if (existing) existing.push(item)
    else grouped.set(name, [item])
  }
  return Array.from(grouped.entries())
}

function sortDescription(mode: WorkItemSortMode) {
  if (mode === 'due-asc') return 'Sorted by due date (earliest first). Items with no due date are last.'
  if (mode === 'due-desc') return 'Sorted by due date (latest first). Items with no due date are last.'
  if (mode === 'project-title-asc') return 'Sorted by project title A–Z.'
  if (mode === 'project-title-desc') return 'Sorted by project title Z–A.'
  return 'Sorted by recent project activity, then urgency.'
}

export function generateWorkItemsMarkdown(items: WorkItem[], mode: WorkItemSortMode) {
  const exported = new Date().toISOString().slice(0, 10)
  const header = [
    '# Work Items',
    '',
    `_Exported ${exported}. ${items.length} item${items.length === 1 ? '' : 's'}. ${sortDescription(mode)}_`,
    '',
  ].join('\n')

  const sections = groupByProject(items).map(([projectName, projectItems]) => {
    const entries = projectItems.map((item) => formatWorkItemMarkdown(item, false)).join('\n\n---\n\n')
    return [`## ${projectName}`, '', entries].join('\n')
  })
  return `${header}\n${sections.join('\n\n')}\n`
}

export function downloadTextFile(content: string, filename: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType })
  const link = document.createElement('a')
  const url = URL.createObjectURL(blob)
  link.href = url
  link.download = filename
  link.style.visibility = 'hidden'
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}
