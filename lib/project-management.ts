import { NextResponse } from 'next/server'
import { type WorkItemStatus, type WorkItemRole } from '@prisma/client'
import { sumDecimalHours } from '@/lib/decimal-hours'
import { decodeOpaqueCursor, encodeOpaqueCursor } from '@/lib/opaque-cursor'
import { parsePublicId } from '@/lib/public-id'

export const PROJECT_STATUSES = ['Planning', 'In Progress', 'Review', 'Completed', 'On Hold'] as const
export const PROJECT_PRIORITIES = ['Low', 'Medium', 'High', 'Critical'] as const

export function parsePage(params: URLSearchParams, filterKey: string, ownerPublicId: string) {
  const rawLimit = params.get('limit')
  const limit = rawLimit === null ? 50 : Number(rawLimit)
  if (!Number.isInteger(limit) || limit < 1 || limit > 200) return { error: 'Limit must be 1–200' }
  const rawCursor = params.get('cursor')
  if (!rawCursor) return { limit, cursor: undefined as bigint | undefined }
  const decoded = decodeOpaqueCursor(rawCursor, { ownerPublicId, filterHash: filterKey })
  if (!decoded) return { error: 'Invalid cursor' }
  return { limit, cursor: decoded.internalId }
}

export function nextPage<T extends { id: bigint; publicId: string }>(
  rows: T[],
  limit: number,
  filterKey: string,
  ownerPublicId: string,
) {
  const items = rows.slice(0, limit)
  const last = items.at(-1)
  if (rows.length <= limit || !last) return { items, page: { limit, nextCursor: null as string | null } }
  const nextCursor = encodeOpaqueCursor({
    ownerPublicId,
    filterHash: filterKey,
    internalId: last.id,
    tieBreaker: last.publicId,
  })
  if (!nextCursor) throw new Error('Cursor secret unavailable')
  return { items, page: { limit, nextCursor } }
}

export function optionalPublicId(value: string | null, field: string): { publicId: string | null } | { error: string; field: string } {
  if (!value) return { publicId: null }
  const publicId = parsePublicId(value)
  if (!publicId) return { error: 'ต้องเป็น public UUID', field }
  return { publicId }
}

export function apiError(status: number, code: string, message: string, field?: string) {
  return NextResponse.json({ error: { code, message, ...(field ? { field } : {}) } }, { status })
}

export function companyRelationConflict(error: unknown) {
  if (typeof error !== 'object' || error === null || !('code' in error) || error.code !== 'P2003') return null
  const meta = 'meta' in error && typeof error.meta === 'object' && error.meta !== null ? error.meta : null
  const field = meta && 'field_name' in meta ? String(meta.field_name) : ''
  if (!field.toLowerCase().replaceAll('_', '').includes('companyid')) return null
  return apiError(409, 'COMPANY_CONFLICT', 'Company ถูกลบหรือใช้งานไม่ได้ กรุณาเลือก Company ใหม่', 'companyId')
}

export function parseCalendarDate(value: unknown): Date | null {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
  const date = new Date(`${value}T00:00:00.000Z`)
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value ? null : date
}

export function calendarDate(value: Date) {
  return value.toISOString().slice(0, 10)
}

export function bangkokTimestamp(value: Date) {
  return `${value.toISOString().slice(0, -1)}+07:00`
}

export function serializeTimestamps<T extends { createdAt: Date; updatedAt: Date }>(value: T) {
  return { ...value, createdAt: bangkokTimestamp(value.createdAt), updatedAt: bangkokTimestamp(value.updatedAt) }
}

function readProjectIdentity(input: Record<string, unknown>, data: Record<string, unknown>) {
  for (const field of ['name', 'companyId']) {
    if (input[field] === undefined) continue
    if (typeof input[field] !== 'string' || !input[field].trim()) return { error: 'Required text is empty', field }
    data[field] = input[field].trim()
  }
  return null
}

function readProjectDates(input: Record<string, unknown>, data: Record<string, unknown>) {
  for (const field of ['startDate', 'dueDate']) {
    if (input[field] === undefined) continue
    const date = parseCalendarDate(input[field])
    if (!date) return { error: 'Use YYYY-MM-DD', field }
    data[field] = date
  }
  if (data.startDate instanceof Date && data.dueDate instanceof Date && data.startDate > data.dueDate) {
    return { error: 'Due date precedes start date', field: 'dueDate' }
  }
  return null
}

function readProjectOptions(input: Record<string, unknown>, data: Record<string, unknown>) {
  for (const field of ['description', 'colorProject']) {
    if (input[field] === undefined) continue
    if (input[field] !== null && typeof input[field] !== 'string') return { error: 'Invalid text', field }
    data[field] = input[field]
  }
  if (input.status !== undefined) {
    if (!PROJECT_STATUSES.includes(input.status as typeof PROJECT_STATUSES[number])) return { error: 'Invalid status', field: 'status' }
    data.status = input.status
  }
  if (input.priority !== undefined) {
    if (!PROJECT_PRIORITIES.includes(input.priority as typeof PROJECT_PRIORITIES[number])) return { error: 'Invalid priority', field: 'priority' }
    data.priority = input.priority
  }
  return null
}

export function parseProjectInput(body: unknown, partial = false): { data?: Record<string, unknown>; error?: string; field?: string } {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { error: 'Invalid request body', field: 'body' }
  const input = body as Record<string, unknown>
  const allowed = ['name', 'companyId', 'description', 'status', 'priority', 'startDate', 'dueDate', 'colorProject']
  const unknownField = Object.keys(input).find((key) => !allowed.includes(key))
  if (unknownField) return { error: 'Unsupported field', field: unknownField }
  if (!partial && ['name', 'companyId', 'startDate', 'dueDate'].some((key) => input[key] === undefined)) {
    return { error: 'Name, Company and dates are required', field: 'body' }
  }
  if (partial && Object.keys(input).length === 0) return { error: 'No changes supplied', field: 'body' }
  const data: Record<string, unknown> = {}
  const error = readProjectIdentity(input, data) ?? readProjectDates(input, data) ?? readProjectOptions(input, data)
  if (error) return error
  return { data }
}

export function projectSummary(
  workItems: ReadonlyArray<{ status: WorkItemStatus; role: WorkItemRole | null }>,
  hours: ReadonlyArray<{ hours: { toString(): string } }>,
) {
  const statusCounts: Record<string, number> = {}
  const roles: Record<string, number> = { Developer: 0, infra: 0, SA: 0 }
  for (const item of workItems) {
    const status = item.status.replaceAll('_', '-')
    statusCounts[status] = (statusCounts[status] ?? 0) + 1
    if (item.role) roles[item.role] += 1
  }
  const completed = statusCounts.completed ?? 0
  const cancelled = statusCounts.cancelled ?? 0
  const total = workItems.length
  const totalHours = sumDecimalHours(hours.map((entry) => entry.hours.toString()))
  return {
    statusCounts, roles, total, completed, cancelled,
    open: total - completed - cancelled,
    progress: completionRate(total, completed, cancelled),
    hours: totalHours,
  }
}

export function completionRate(total: number, completed: number, cancelled: number) {
  const eligible = total - cancelled
  return eligible === 0 ? 0 : completed / eligible * 100
}

export function companySummary(projects: ReadonlyArray<{ summary: { total: number; hours: string } }>) {
  return {
    projects: projects.length,
    workItems: projects.reduce((sum, project) => sum + project.summary.total, 0),
    hours: sumDecimalHours(projects.map((project) => project.summary.hours)),
  }
}
