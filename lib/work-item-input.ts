import type {
  WorkItemKind,
  WorkItemPriority,
  WorkItemRole,
  WorkItemStatus,
} from '@prisma/client'
import {
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

function parseClassification(body: Record<string, unknown>):
  | { data: Pick<ParsedWorkItemInput, 'kind' | 'status' | 'priority' | 'role' | 'types'> }
  | { error: string } {
  if (!isWorkItemKind(body.kind)) {
    return { error: 'kind must be Incident, Issue, or Task' }
  }

  const status = parseWorkItemStatus(body.status ?? 'backlog')
  if (!status) return { error: 'Invalid status' }

  const priority = body.priority ?? 'none'
  if (!isWorkItemPriority(priority)) return { error: 'Invalid priority' }

  const role = body.role === '' ? null : body.role ?? null
  if (role !== null && !isWorkItemRole(role)) return { error: 'Invalid role' }

  const types = parseWorkItemTypes(body.types)
  if (types === null) return { error: 'Invalid types' }

  return { data: { kind: body.kind, status, priority, role, types } }
}

function parseOptionalFields(body: Record<string, unknown>, ownerId: string):
  | { data: Pick<ParsedWorkItemInput, 'description' | 'workDate' | 'dueDate' | 'assigneeId' | 'id'> }
  | { error: string } {
  const descriptionValue = body.description ?? null
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

  if (
    body.assigneeId !== undefined &&
    body.assigneeId !== null &&
    body.assigneeId !== '' &&
    body.assigneeId !== ownerId
  ) {
    return { error: 'assigneeId must match the authenticated owner' }
  }

  return { data: { ...(id ? { id } : {}), description, workDate, dueDate, assigneeId: ownerId } }
}

export function parseWorkItemInput(value: unknown, ownerId: string): ParseResult {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return { error: 'Work item must be an object' }
  }

  const body = value as Record<string, unknown>
  const title = typeof body.title === 'string' ? body.title.trim() : ''
  const projectId = typeof body.projectId === 'string' ? body.projectId.trim() : ''
  if (!title || !projectId) return { error: 'Title and project ID are required' }

  const classification = parseClassification(body)
  if ('error' in classification) return classification
  const optional = parseOptionalFields(body, ownerId)
  if ('error' in optional) return optional

  return {
    data: {
      ...classification.data,
      ...optional.data,
      title,
      projectId,
    },
  }
}
