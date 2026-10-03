import type { WorkItemKindValue, WorkItemPriorityValue, WorkItemStatusValue } from '@/lib/work-items'
import type { WorkItem } from './types'

export const DEFAULT_PROJECT_COLOR = 'var(--project-accent)'

export const MONTH_OPTIONS = [
  { value: '1', label: 'January' },
  { value: '2', label: 'February' },
  { value: '3', label: 'March' },
  { value: '4', label: 'April' },
  { value: '5', label: 'May' },
  { value: '6', label: 'June' },
  { value: '7', label: 'July' },
  { value: '8', label: 'August' },
  { value: '9', label: 'September' },
  { value: '10', label: 'October' },
  { value: '11', label: 'November' },
  { value: '12', label: 'December' },
] as const

type WorkItemFilterKeyInput = Readonly<{
  year: string
  month: string
  project: string
  company: string
  dateRange: { startDate: string; endDate: string } | null
  status: string
  priority: string
  role: string
  kind: string
  openOnly: boolean
  overdueOnly: boolean
  search: string
}>

export function createWorkItemFilterKey(filters: WorkItemFilterKeyInput): string {
  return [
    filters.year,
    filters.month,
    filters.project,
    filters.company,
    filters.dateRange?.startDate,
    filters.dateRange?.endDate,
    filters.status,
    filters.priority,
    filters.role,
    filters.kind,
    filters.openOnly,
    filters.overdueOnly,
    filters.search.trim(),
  ].join('|')
}

export function isWorkItemListLoading(
  loadedFilterKey: string | null,
  loadingFilterKey: string | null,
  filterKey: string,
  loadError: string | null,
): boolean {
  return loadingFilterKey === filterKey || (loadedFilterKey !== filterKey && !loadError)
}

export function resolveProjectColor(color: string | null | undefined): string {
  return color?.trim() || DEFAULT_PROJECT_COLOR
}

function withAlpha(color: string, alpha: string): string {
  if (/^#[\da-f]{3}$/i.test(color)) {
    const expanded = color.slice(1).split('').map((channel) => channel.repeat(2)).join('')
    return `#${expanded}${alpha}`
  }
  if (/^#[\da-f]{6}$/i.test(color)) {
    return `${color}${alpha}`
  }
  return `color-mix(in srgb, ${color} ${Math.round(Number.parseInt(alpha, 16) / 255 * 100)}%, transparent)`
}

export function projectAccentStyle(color: string | null | undefined) {
  const value = resolveProjectColor(color)
  return {
    color: value,
    backgroundColor: withAlpha(value, '18'),
    borderColor: value,
    borderTint: withAlpha(value, '33'),
    softBackground: withAlpha(value, '0F'),
  }
}

export function projectInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return 'PR'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return `${parts[0][0]}${parts[1][0]}`.toUpperCase()
}

export function formatDisplayDate(value: string | null | undefined) {
  return value ? value.slice(0, 10) : '—'
}

export function workItemFocusDate(item: WorkItem): string | null {
  return item.workDate || item.dueDate || item.createdAt || null
}

export function workItemDateParts(item: WorkItem): { year: string; month: string } | null {
  const focus = workItemFocusDate(item)
  if (!focus || focus.length < 7) return null
  const year = focus.slice(0, 4)
  const monthNumber = Number(focus.slice(5, 7))
  if (!/^\d{4}$/.test(year) || monthNumber < 1 || monthNumber > 12) return null
  return { year, month: String(monthNumber) }
}

export function descriptionPreview(text: string, maxLength = 180): string {
  const plain = text.replaceAll(/[#*_`]/g, '').replaceAll(/\s+/g, ' ').trim()
  if (plain.length <= maxLength) return plain
  return `${plain.slice(0, maxLength).trimEnd()}…`
}

export function priorityClass(priority: WorkItemPriorityValue) {
  switch (priority) {
    case 'urgent':
      return 'bg-destructive text-destructive-foreground'
    case 'high':
      return 'bg-danger-subtle text-danger border-danger/30'
    case 'medium':
      return 'bg-warning-subtle text-warning border-warning/30'
    case 'low':
      return 'bg-muted text-muted-foreground border-border'
    default:
      return 'bg-muted text-muted-foreground'
  }
}

export function statusClass(status: WorkItemStatusValue) {
  switch (status) {
    case 'in-progress':
      return 'bg-info-subtle text-info border-info/30'
    case 'sa-testing':
    case 'pm-testing':
      return 'bg-accent text-accent-foreground border-info/30'
    case 'completed':
      return 'bg-success-subtle text-success border-success/30'
    case 'blocked':
    case 'cancelled':
      return 'bg-danger-subtle text-danger border-danger/30'
    default:
      return 'bg-muted text-muted-foreground border-border'
  }
}

export function kindClass(kind: WorkItemKindValue) {
  switch (kind) {
    case 'Incident':
      return 'bg-danger-subtle text-danger border-danger/30'
    case 'Issue':
      return 'bg-warning-subtle text-warning border-warning/30'
    default:
      return 'bg-info-subtle text-info border-info/30'
  }
}
