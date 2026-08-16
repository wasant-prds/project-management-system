import type { WorkItemKind, WorkItemPriority, WorkItemRole, WorkItemStatus } from '@prisma/client'

export const DEFAULT_ASSIGNEE_ID = 'cmgupk5uo000bld2wm9rvq28j'
export const DEFAULT_ASSIGNEE_NAME = 'Wasant Pep'

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

const STATUS_TO_PRISMA: Record<WorkItemStatusValue, WorkItemStatus> = {
  backlog: 'backlog',
  todo: 'todo',
  'in-progress': 'in_progress',
  blocked: 'blocked',
  'sa-testing': 'sa_testing',
  'pm-testing': 'pm_testing',
  completed: 'completed',
  cancelled: 'cancelled',
}

const STATUS_FROM_PRISMA: Record<WorkItemStatus, WorkItemStatusValue> = {
  backlog: 'backlog',
  todo: 'todo',
  in_progress: 'in-progress',
  blocked: 'blocked',
  sa_testing: 'sa-testing',
  pm_testing: 'pm-testing',
  completed: 'completed',
  cancelled: 'cancelled',
}

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
  if (value in STATUS_TO_PRISMA) {
    return STATUS_TO_PRISMA[value as WorkItemStatusValue]
  }
  if (value in STATUS_FROM_PRISMA) {
    return value as WorkItemStatus
  }
  return null
}

export function serializeWorkItemStatus(status: WorkItemStatus): WorkItemStatusValue {
  return STATUS_FROM_PRISMA[status]
}

export function shouldStampSubmittedAt(status: WorkItemStatus): boolean {
  const serialized = serializeWorkItemStatus(status)
  return SUBMITTED_AT_STATUSES.includes(serialized)
}

export function parseWorkItemTypes(value: unknown): string[] | null {
  if (value === undefined || value === null) return []
  if (!Array.isArray(value)) return null

  const types: string[] = []
  for (const item of value) {
    if (typeof item !== 'string' || !WORK_ITEM_TYPES.includes(item as WorkItemTypeValue)) {
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
