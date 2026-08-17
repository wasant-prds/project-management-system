import {
  WORK_ITEM_PRIORITY_LABELS,
  WORK_ITEM_ROLE_LABELS,
  WORK_ITEM_STATUS_LABELS,
} from '@/lib/work-items'
import { formatDisplayDate } from './work-item-presentation'
import type { WorkItem } from './types'

export const WORK_ITEM_SORT_MODES = ['project-title', 'due-asc', 'due-desc'] as const
export type WorkItemSortMode = (typeof WORK_ITEM_SORT_MODES)[number]

export const WORK_ITEM_SORT_LABELS: Record<WorkItemSortMode, string> = {
  'project-title': 'Project → Title',
  'due-asc': 'Due date ↑',
  'due-desc': 'Due date ↓',
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

export function nextWorkItemSortMode(mode: WorkItemSortMode): WorkItemSortMode {
  if (mode === 'project-title') return 'due-asc'
  if (mode === 'due-asc') return 'due-desc'
  return 'project-title'
}

function compareText(left: string, right: string) {
  return left.localeCompare(right, undefined, { sensitivity: 'base', numeric: true })
}

function dueTimestamp(item: WorkItem): number | null {
  if (!item.dueDate) return null
  const value = new Date(item.dueDate).getTime()
  return Number.isNaN(value) ? null : value
}

function compareByProjectThenTitle(left: WorkItem, right: WorkItem) {
  const byProject = compareText(left.project.name, right.project.name)
  if (byProject !== 0) return byProject
  return compareText(left.title, right.title)
}

function compareByDueDate(left: WorkItem, right: WorkItem, direction: 'asc' | 'desc') {
  const leftDue = dueTimestamp(left)
  const rightDue = dueTimestamp(right)
  if (leftDue === null && rightDue === null) return compareText(left.title, right.title)
  if (leftDue === null) return 1
  if (rightDue === null) return -1
  const diff = direction === 'asc' ? leftDue - rightDue : rightDue - leftDue
  if (diff !== 0) return diff
  return compareText(left.title, right.title)
}

export function sortWorkItems(items: WorkItem[], mode: WorkItemSortMode): WorkItem[] {
  const sorted = [...items]
  if (mode === 'due-asc') {
    sorted.sort((left, right) => compareByDueDate(left, right, 'asc'))
  } else if (mode === 'due-desc') {
    sorted.sort((left, right) => compareByDueDate(left, right, 'desc'))
  } else {
    sorted.sort(compareByProjectThenTitle)
  }
  return sorted
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
  if (mode === 'due-asc') return 'Sorted by due date (oldest first). Items with no due date are last.'
  if (mode === 'due-desc') return 'Sorted by due date (newest first). Items with no due date are last.'
  return 'Sorted by project name, then work item title.'
}

export function generateWorkItemsMarkdown(items: WorkItem[], mode: WorkItemSortMode) {
  const exported = new Date().toISOString().slice(0, 10)
  const header = [
    '# Work Items',
    '',
    `_Exported ${exported}. ${items.length} item${items.length === 1 ? '' : 's'}. ${sortDescription(mode)}_`,
    '',
  ].join('\n')

  if (mode === 'project-title') {
    const sections = groupByProject(items).map(([projectName, projectItems]) => {
      const entries = projectItems.map((item) => formatWorkItemMarkdown(item, false)).join('\n\n---\n\n')
      return [`## ${projectName}`, '', entries].join('\n')
    })
    return `${header}\n${sections.join('\n\n')}\n`
  }

  const entries = items.map((item) => formatWorkItemMarkdown(item, true)).join('\n\n---\n\n')
  return `${header}\n${entries}\n`
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
