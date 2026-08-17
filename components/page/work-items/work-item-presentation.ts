import type { WorkItemKindValue, WorkItemPriorityValue, WorkItemStatusValue } from '@/lib/work-items'
import type { WorkItem } from './types'

export const DEFAULT_PROJECT_COLOR = '#3b82f6'

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

export function resolveProjectColor(color: string | null | undefined): string {
  return color?.trim() || DEFAULT_PROJECT_COLOR
}

function withAlpha(color: string, alpha: string): string {
  if (color.startsWith('#') && (color.length === 4 || color.length === 7)) {
    return `${color}${alpha}`
  }
  return color
}

export function projectAccentStyle(color: string | null | undefined) {
  const value = resolveProjectColor(color)
  return {
    color: value,
    backgroundColor: withAlpha(value, '18'),
    borderColor: value,
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
      return 'bg-destructive/10 text-destructive border-destructive/20'
    case 'medium':
      return 'bg-chart-5/10 text-chart-5 border-chart-5/20'
    case 'low':
      return 'bg-chart-1/10 text-chart-1 border-chart-1/20'
    default:
      return 'bg-muted text-muted-foreground'
  }
}

export function statusClass(status: WorkItemStatusValue) {
  switch (status) {
    case 'in-progress':
      return 'bg-chart-2/10 text-chart-2 border-chart-2/20'
    case 'sa-testing':
    case 'pm-testing':
      return 'bg-chart-4/10 text-chart-4 border-chart-4/20'
    case 'completed':
      return 'bg-chart-1/10 text-chart-1 border-chart-1/20'
    case 'blocked':
    case 'cancelled':
      return 'bg-destructive/10 text-destructive border-destructive/20'
    default:
      return 'bg-muted text-muted-foreground border-border'
  }
}

export function kindClass(kind: WorkItemKindValue) {
  switch (kind) {
    case 'Incident':
      return 'bg-destructive/10 text-destructive border-destructive/20'
    case 'Issue':
      return 'bg-chart-5/10 text-chart-5 border-chart-5/20'
    default:
      return 'bg-chart-2/10 text-chart-2 border-chart-2/20'
  }
}
