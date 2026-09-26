import type {
  WorkItemKind,
  WorkItemPriority,
  WorkItemRole,
  WorkItemStatus,
} from '@prisma/client'
import {
  DEFAULT_ASSIGNEE_ID,
  isWorkItemKind,
  isWorkItemPriority,
  isWorkItemRole,
  parseWorkItemStatus,
  parseWorkItemTypes,
} from '@/lib/work-items'

export type ParsedWorkItemInput = {
  id?: string
  title: string
  description: string | null
  kind: WorkItemKind
  priority: WorkItemPriority
  role: WorkItemRole | null
  status: WorkItemStatus
  types: string[]
  workDate: Date | null
  dueDate: Date | null
  projectId: string
  assigneeId: string
}

type ParseResult = { data: ParsedWorkItemInput } | { error: string }

function parseDate(value: unknown, field: string): Date | null | string {
  if (value === undefined || value === null || value === '') return null
  if (typeof value !== 'string') return `${field} must be a date string`

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return `${field} must be a valid date`
  return date
}

export function parseWorkItemInput(value: unknown): ParseResult {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return { error: 'Work item must be an object' }
  }

  const body = value as Record<string, unknown>
  const title = typeof body.title === 'string' ? body.title.trim() : ''
  const projectId = typeof body.projectId === 'string' ? body.projectId.trim() : ''
  if (!title || !projectId) {
    return { error: 'Title and project ID are required' }
  }

  if (!isWorkItemKind(body.kind)) {
    return { error: 'kind must be Incident, Issue, or Task' }
  }

  const status = body.status === undefined || body.status === null
    ? 'backlog'
    : parseWorkItemStatus(body.status)
  if (!status) return { error: 'Invalid status' }

  const priority = body.priority ?? 'none'
  if (!isWorkItemPriority(priority)) return { error: 'Invalid priority' }

  const role = body.role === undefined || body.role === null || body.role === ''
    ? null
    : body.role
  if (role !== null && !isWorkItemRole(role)) return { error: 'Invalid role' }

  const types = parseWorkItemTypes(body.types)
  if (types === null) return { error: 'Invalid types' }

  const descriptionValue = body.description === undefined || body.description === null
    ? null
    : body.description
  if (descriptionValue !== null && typeof descriptionValue !== 'string') {
    return { error: 'Description must be a string' }
  }
  const description = descriptionValue || null

  const workDate = parseDate(body.workDate, 'workDate')
  if (typeof workDate === 'string') return { error: workDate }
  const dueDate = parseDate(body.dueDate, 'dueDate')
  if (typeof dueDate === 'string') return { error: dueDate }

  let id: string | undefined
  if (body.id !== undefined && body.id !== null && body.id !== '') {
    if (typeof body.id !== 'string' || !body.id.trim()) {
      return { error: 'id must be a non-empty string' }
    }
    id = body.id.trim()
  }

  let assigneeId = DEFAULT_ASSIGNEE_ID
  if (body.assigneeId !== undefined && body.assigneeId !== null && body.assigneeId !== '') {
    if (typeof body.assigneeId !== 'string' || !body.assigneeId.trim()) {
      return { error: 'assigneeId must be a non-empty string' }
    }
    assigneeId = body.assigneeId.trim()
  }

  return {
    data: {
      ...(id ? { id } : {}),
      title,
      description,
      kind: body.kind,
      priority,
      role,
      status,
      types,
      workDate,
      dueDate,
      projectId,
      assigneeId,
    },
  }
}
