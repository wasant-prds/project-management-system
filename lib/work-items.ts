import type { WorkItemKind, WorkItemPriority, WorkItemRole, WorkItemStatus } from '@/lib/database/types'

export const WORK_ITEM_KINDS = ['Incident', 'Issue', 'Task'] as const
export type WorkItemKindValue = (typeof WORK_ITEM_KINDS)[number]

export const WORK_ITEM_PRIORITIES = ['none', 'low', 'medium', 'high', 'urgent'] as const
export type WorkItemPriorityValue = (typeof WORK_ITEM_PRIORITIES)[number]

export const WORK_ITEM_ROLES = ['Developer', 'infra', 'SA'] as const
export type WorkItemRoleValue = (typeof WORK_ITEM_ROLES)[number]

export const WORK_ITEM_STATUSES = [
  'backlog',
  'todo',
  'in-progress',
  'blocked',
  'sa-testing',
  'pm-testing',
  'completed',
  'cancelled',
] as const
export type WorkItemStatusValue = (typeof WORK_ITEM_STATUSES)[number]

export const WORK_ITEM_TYPES = [
  'bug',
  'data',
  'documentation',
  'epic',
  'feature',
  'maintenance',
  'opl',
  'ops',
  'support',
  'task',
] as const
export type WorkItemTypeValue = (typeof WORK_ITEM_TYPES)[number]

export const SUBMITTED_AT_STATUSES: readonly WorkItemStatusValue[] = ['sa-testing', 'completed']

export function isWorkItemKind(value: unknown): value is WorkItemKind {
  return typeof value === 'string' && WORK_ITEM_KINDS.includes(value as WorkItemKindValue)
}

export function isWorkItemPriority(value: unknown): value is WorkItemPriority {
  return typeof value === 'string' && WORK_ITEM_PRIORITIES.includes(value as WorkItemPriorityValue)
}

export function isWorkItemRole(value: unknown): value is WorkItemRole {
  return typeof value === 'string' && WORK_ITEM_ROLES.includes(value as WorkItemRoleValue)
}

export function parseWorkItemStatus(value: unknown): WorkItemStatus | null {
  if (typeof value !== 'string') return null
  const status = value.replaceAll('_', '-')
  return WORK_ITEM_STATUSES.includes(status as WorkItemStatusValue) ? (status as WorkItemStatus) : null
}

export function serializeWorkItemStatus(status: WorkItemStatus): WorkItemStatusValue {
  return status
}

export function shouldStampSubmittedAt(status: WorkItemStatus): boolean {
  const serialized = serializeWorkItemStatus(status)
  return SUBMITTED_AT_STATUSES.includes(serialized)
}

export function parseWorkItemTypes(value: unknown, existingLabels: readonly string[] = []): string[] | null {
  if (value === undefined || value === null) return []
  if (!Array.isArray(value)) return null

  const types: string[] = []
  for (const item of value) {
    if (
      typeof item !== 'string' ||
      (!WORK_ITEM_TYPES.includes(item as WorkItemTypeValue) && !existingLabels.includes(item))
    ) {
      return null
    }
    if (!types.includes(item)) {
      types.push(item)
    }
  }
  return types
}

export const WORK_ITEM_PRIORITY_LABELS: Record<WorkItemPriorityValue, string> = {
  none: 'None',
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  urgent: 'Urgent',
}

export const WORK_ITEM_ROLE_LABELS: Record<WorkItemRoleValue, string> = {
  Developer: 'Developer',
  infra: 'Infrastructure',
  SA: 'System Analyst',
}

export const WORK_ITEM_STATUS_LABELS: Record<WorkItemStatusValue, string> = {
  backlog: 'Backlog',
  todo: 'To Do',
  'in-progress': 'In Progress',
  blocked: 'Blocked',
  'sa-testing': 'SA Testing',
  'pm-testing': 'PM Testing',
  completed: 'Completed',
  cancelled: 'Cancelled',
}
