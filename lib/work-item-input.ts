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
import { parseBangkokCalendarDate } from '@/lib/bangkok-datetime'

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
type PatchParseResult = { data: Partial<ParsedWorkItemInput> } | { error: string }

function parseDate(value: unknown, field: string): Date | null | string {
  if (value === undefined || value === null || value === '') return null
  const date = parseBangkokCalendarDate(value)
  if (!date) return `${field} must use a valid YYYY-MM-DD value`
  return date
}

function parseDescription(value: unknown): { data: string | null } | { error: string } {
  if (value === undefined || value === null) return { data: null }
  if (typeof value !== 'string') return { error: 'Description must be a string' }
  return { data: value.trim() || null }
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
  const description = parseDescription(body.description)
  if ('error' in description) return description

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

  return { data: { ...(id ? { id } : {}), description: description.data, workDate, dueDate, assigneeId: ownerId } }
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

function parsePatchBasics(body: Record<string, unknown>): PatchParseResult {
  const data: Partial<ParsedWorkItemInput> = {}
  if (body.title !== undefined) {
    if (typeof body.title !== 'string' || !body.title.trim()) return { error: 'Title is required' }
    data.title = body.title.trim()
  }
  if (body.description !== undefined) {
    const description = parseDescription(body.description)
    if ('error' in description) return description
    data.description = description.data
  }
  return { data }
}

function mergePatchResults(results: readonly PatchParseResult[]): PatchParseResult {
  const data: Partial<ParsedWorkItemInput> = {}
  for (const result of results) {
    if ('error' in result) return result
    Object.assign(data, result.data)
  }
  return { data }
}

function parsePatchKind(body: Record<string, unknown>): PatchParseResult {
  if (body.kind === undefined) return { data: {} }
  if (!isWorkItemKind(body.kind)) return { error: 'kind must be Incident, Issue, or Task' }
  return { data: { kind: body.kind } }
}

function parsePatchStatus(body: Record<string, unknown>): PatchParseResult {
  if (body.status === undefined) return { data: {} }
  const status = parseWorkItemStatus(body.status)
  if (!status) return { error: 'Invalid status' }
  return { data: { status } }
}

function parsePatchPriority(body: Record<string, unknown>): PatchParseResult {
  if (body.priority === undefined) return { data: {} }
  if (!isWorkItemPriority(body.priority)) return { error: 'Invalid priority' }
  return { data: { priority: body.priority } }
}

function parsePatchRole(body: Record<string, unknown>): PatchParseResult {
  if (body.role === undefined) return { data: {} }
  const role = body.role === '' ? null : body.role
  if (role !== null && !isWorkItemRole(role)) return { error: 'Invalid role' }
  return { data: { role } }
}

function parsePatchTypes(body: Record<string, unknown>): PatchParseResult {
  if (body.types === undefined) return { data: {} }
  const types = parseWorkItemTypes(body.types)
  if (!types) return { error: 'Invalid types' }
  return { data: { types } }
}

function parsePatchClassification(body: Record<string, unknown>): PatchParseResult {
  return mergePatchResults([
    parsePatchKind(body),
    parsePatchStatus(body),
    parsePatchPriority(body),
    parsePatchRole(body),
    parsePatchTypes(body),
  ])
}

function parsePatchDates(body: Record<string, unknown>): PatchParseResult {
  const data: Partial<ParsedWorkItemInput> = {}
  for (const field of ['workDate', 'dueDate'] as const) {
    if (body[field] === undefined) continue
    const date = parseDate(body[field], field)
    if (typeof date === 'string') return { error: date }
    data[field] = date
  }
  return { data }
}

function parsePatchRelations(body: Record<string, unknown>, ownerId: string): PatchParseResult {
  const data: Partial<ParsedWorkItemInput> = {}
  if (body.projectId !== undefined) {
    if (typeof body.projectId !== 'string' || !body.projectId.trim()) {
      return { error: 'Project ID is required' }
    }
    data.projectId = body.projectId.trim()
  }
  if (body.assigneeId !== undefined) {
    if (body.assigneeId !== ownerId) return { error: 'assigneeId must match the authenticated owner' }
    data.assigneeId = ownerId
  }
  return { data }
}

export function parseWorkItemPatch(value: unknown, ownerId: string): PatchParseResult {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return { error: 'Work item must be an object' }
  }

  const body = value as Record<string, unknown>
  if (body.id !== undefined) return { error: 'id cannot be updated' }

  const results = [
    parsePatchBasics(body),
    parsePatchClassification(body),
    parsePatchDates(body),
    parsePatchRelations(body, ownerId),
  ]
  return mergePatchResults(results)
}
