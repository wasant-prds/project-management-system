import { NextResponse } from 'next/server'
import { workItems } from '@/lib/database/repositories/work-items'
import { projects } from '@/lib/database/repositories/projects'
import { companies } from '@/lib/database/repositories/companies'
import { sql, and, or, syntax, literalContains, type Sql } from '@/lib/database/sql'
import {
  WORK_ITEM_KINDS,
  WORK_ITEM_PRIORITIES,
  WORK_ITEM_ROLES,
  WORK_ITEM_STATUSES,
  WORK_ITEM_TYPES,
  isWorkItemKind,
  isWorkItemPriority,
  isWorkItemRole,
  parseWorkItemStatus,
} from '@/lib/work-items'
import { bangkokDateRange, currentBangkokCalendarDate } from '@/lib/bangkok-datetime'
import { serializeWorkItem } from '@/lib/work-item-response'
import { createHash } from 'node:crypto'
import { encodeOpaqueCursor, decodeOpaqueCursor } from '@/lib/opaque-cursor'
import { parsePublicId } from '@/lib/public-id'

type WorkItemCursor = { id: bigint; createdAt: Date }
type WorkItemListQuery = {
  ownerId: bigint
  ownerPublicId: string
  projectPublicId: string | null
  companyPublicId: string | null
  yearParam: string
  monthParam: string
  startDate: string | null
  endDate: string | null
  search: string
  includeYears: boolean
  limit: number
  cursor: WorkItemCursor | null
  filterHash: string
  overdueAsOf: string | null
  where: Sql
}
type WorkItemListQueryResult =
  | { success: true; query: WorkItemListQuery }
  | { success: false; response: NextResponse }

const DEFAULT_PAGE_LIMIT = 50
const MAX_PAGE_LIMIT = 200

async function getAvailableYears(ownerId: bigint) {
  return (await workItems.years(ownerId)).map(String)
}

function dateRangeFor(year: number, month: number | null) {
  const start = new Date(Date.UTC(year, month === null ? 0 : month - 1, 1))
  const end = month === null ? new Date(Date.UTC(year + 1, 0, 1)) : new Date(Date.UTC(year, month, 1))
  return anchorRange(start, end)
}

function anchorRange(start: Date, end: Date) {
  return sql`COALESCE(w.work_date,w.due_date,w.created_at)>=${start} AND COALESCE(w.work_date,w.due_date,w.created_at)<${end}`
}

function searchClause(query: string): Sql {
  const value = literalContains(query)
  const normalized = query.toLowerCase()
  return or(
    sql`w.title ILIKE ${value}`,
    sql`w.description ILIKE ${value}`,
    sql`p.name ILIKE ${value}`,
    sql`c.name ILIKE ${value}`,
    sql`c.display_name ILIKE ${value}`,
    sql`u.name ILIKE ${value}`,
    ...WORK_ITEM_KINDS.filter((kind) => kind.toLowerCase().includes(normalized)).map(
      (kind) => sql`w.kind=${kind}`,
    ),
    ...WORK_ITEM_STATUSES.filter((status) => status.includes(normalized)).map(
      (status) => sql`w.status=${status}`,
    ),
    ...WORK_ITEM_PRIORITIES.filter((priority) => priority.includes(normalized)).map(
      (priority) => sql`w.priority=${priority}`,
    ),
    ...WORK_ITEM_ROLES.filter((role) => role.toLowerCase().includes(normalized)).map(
      (role) => sql`w.functional_role=${role}`,
    ),
    ...WORK_ITEM_TYPES.filter((type) => type.includes(normalized)).map(
      (type) => sql`${type}=ANY(w.type_labels)`,
    ),
  )
}

type WorkItemFilterResult =
  | {
      where: Sql
      overdueAsOf: string | null
      projectPublicId: string | null
      companyPublicId: string | null
    }
  | { error: string }

function readFilterPublicId(
  value: string | null,
  field: string,
): { publicId: string | null } | { error: string } {
  if (!value) return { publicId: null }
  const publicId = parsePublicId(value)
  if (!publicId) return { error: `Invalid ${field}` }
  return { publicId }
}

function validateAssigneeFilter(assigneeId: string | null, ownerId: string) {
  return assigneeId && assigneeId !== ownerId ? 'assigneeId ต้องเป็นเจ้าของระบบ' : null
}

function applyKindFilter(where: Sql[], kind: string | null) {
  if (!kind) return null
  if (!isWorkItemKind(kind)) return 'Invalid kind'
  where.push(sql`w.kind=${kind}`)
  return null
}

function applyStatusFilter(where: Sql[], statusParam: string | null) {
  if (!statusParam) return null
  const status = parseWorkItemStatus(statusParam)
  if (!status) return 'Invalid status'
  where.push(sql`w.status=${status}`)
  return null
}

function applyPriorityFilter(where: Sql[], priority: string | null) {
  if (!priority) return null
  if (!isWorkItemPriority(priority)) return 'Invalid priority'
  where.push(sql`w.priority=${priority}`)
  return null
}

function applyRoleFilter(where: Sql[], role: string | null) {
  if (!role) return null
  if (role === 'none') {
    where.push(sql`w.functional_role IS NULL`)
    return null
  }
  if (!isWorkItemRole(role)) return 'Invalid role'
  where.push(sql`w.functional_role=${role}`)
  return null
}

function baseWorkItemFilter(
  searchParams: URLSearchParams,
  ownerInternalId: bigint,
  ownerPublicId: string,
): WorkItemFilterResult {
  const where: Sql[] = [sql`w.assignee_id=${ownerInternalId}`]
  const projectId = searchParams.get('projectId')
  const assigneeId = searchParams.get('assigneeId')
  const kind = searchParams.get('kind')
  const statusParam = searchParams.get('status')
  const priority = searchParams.get('priority')
  const role = searchParams.get('role')
  const companyId = searchParams.get('companyId')
  const openOnly = searchParams.get('openOnly')
  const overdueOnly = searchParams.get('overdue')

  if (openOnly !== null && openOnly !== 'true' && openOnly !== 'false')
    return { error: 'Invalid openOnly filter' }
  if (overdueOnly !== null && overdueOnly !== 'true' && overdueOnly !== 'false')
    return { error: 'Invalid overdue filter' }

  const projectRef = readFilterPublicId(projectId, 'projectId')
  if ('error' in projectRef) return projectRef
  const companyRef = readFilterPublicId(companyId, 'companyId')
  if ('error' in companyRef) return companyRef
  const validationError =
    validateAssigneeFilter(assigneeId, ownerPublicId) ??
    applyKindFilter(where, kind) ??
    applyStatusFilter(where, statusParam) ??
    applyPriorityFilter(where, priority) ??
    applyRoleFilter(where, role)
  if (validationError) return { error: validationError }
  const clauses: Sql[] = []
  let overdueAsOf: string | null = null
  if (openOnly === 'true') clauses.push(sql`w.status NOT IN ('completed','cancelled')`)
  if (overdueOnly === 'true') {
    overdueAsOf = currentBangkokCalendarDate()
    const today = bangkokDateRange(overdueAsOf)
    if (!today) return { error: 'Invalid Bangkok business date' }
    clauses.push(sql`w.due_date<${today.start} AND w.status NOT IN ('completed','cancelled')`)
  }
  where.push(...clauses)
  return {
    where: and(...where),
    overdueAsOf,
    projectPublicId: projectRef.publicId,
    companyPublicId: companyRef.publicId,
  }
}

function selectedDateRange(startDate: string, endDate: string): Sql | null {
  const start = bangkokDateRange(startDate)
  const end = bangkokDateRange(endDate)
  if (!start || !end || end.start < start.start) return null
  return anchorRange(start.start, end.end)
}

async function periodFilter(yearParam: string, monthParam: string, ownerId: bigint) {
  if (yearParam === 'all' && monthParam === 'all') return { clause: null, availableYears: undefined }

  const month = monthParam === 'all' ? null : Number(monthParam)
  let years = [Number(yearParam)]
  let availableYears: string[] | undefined
  if (yearParam === 'all') {
    availableYears = await getAvailableYears(ownerId)
    years = availableYears.map(Number)
  }
  const dateRanges = years.flatMap((year) => dateRangeFor(year, month))
  const clause: Sql = dateRanges.length > 0 ? or(...dateRanges) : syntax('FALSE')
  return { clause, availableYears }
}

function parsePageLimit(value: string | null) {
  if (value === null) return DEFAULT_PAGE_LIMIT
  if (!/^\d+$/.test(value)) return null
  const limit = Number(value)
  return limit >= 1 && limit <= MAX_PAGE_LIMIT ? limit : null
}

function workItemFilterHash(
  searchParams: URLSearchParams,
  year: string,
  month: string,
  search: string,
  overdueAsOf: string | null,
) {
  const filters = {
    year,
    month,
    projectId: searchParams.get('projectId') ?? '',
    companyId: searchParams.get('companyId') ?? '',
    assigneeId: searchParams.get('assigneeId') ?? '',
    kind: searchParams.get('kind') ?? '',
    status: searchParams.get('status') ?? '',
    priority: searchParams.get('priority') ?? '',
    role: searchParams.get('role') ?? '',
    startDate: searchParams.get('startDate') ?? '',
    endDate: searchParams.get('endDate') ?? '',
    openOnly: searchParams.get('openOnly') ?? '',
    overdue: searchParams.get('overdue') ?? '',
    overdueAsOf: overdueAsOf ?? '',
    search,
    order: 'createdAt-desc-id-desc',
  }
  return createHash('sha256').update(JSON.stringify(filters)).digest('hex')
}

function encodeCursor(item: { id: bigint; createdAt: Date }, ownerPublicId: string, filterHash: string) {
  return encodeOpaqueCursor({
    ownerPublicId,
    filterHash,
    internalId: item.id,
    tieBreaker: item.createdAt.toISOString(),
  })
}

function decodeCursor(
  value: string,
  ownerPublicId: string,
  expectedFilterHash: string,
): WorkItemCursor | null {
  const decoded = decodeOpaqueCursor(value, { ownerPublicId, filterHash: expectedFilterHash })
  if (!decoded) return null
  const createdAt = new Date(decoded.tieBreaker)
  if (Number.isNaN(createdAt.getTime())) return null
  return { id: decoded.internalId, createdAt }
}

function cursorClause(cursor: WorkItemCursor): Sql {
  return sql`(w.created_at,w.id)<(${cursor.createdAt},${cursor.id})`
}

function validationResponse(message: string, field?: string) {
  return NextResponse.json(
    {
      error: { code: 'VALIDATION_ERROR', message, ...(field ? { field } : {}) },
    },
    { status: 400 },
  )
}

export function parseWorkItemListQuery(
  searchParams: URLSearchParams,
  ownerPublicId: string,
  ownerInternalId: bigint,
): WorkItemListQueryResult {
  const startDate = searchParams.get('startDate')
  const endDate = searchParams.get('endDate')
  if ((startDate === null) !== (endDate === null)) {
    return {
      success: false,
      response: validationResponse('startDate and endDate must be provided together', 'startDate'),
    }
  }
  const hasDateRange = startDate !== null && endDate !== null
  const yearParam =
    searchParams.get('year') ?? (hasDateRange ? 'all' : currentBangkokCalendarDate().slice(0, 4))
  const monthParam = searchParams.get('month') ?? 'all'
  const search = searchParams.get('search')?.trim() ?? ''
  const includeYears = searchParams.get('includeYears') === 'true'
  const limit = parsePageLimit(searchParams.get('limit'))

  if (limit === null)
    return { success: false, response: validationResponse('limit must be between 1 and 200', 'limit') }
  if (yearParam !== 'all' && !/^\d{4}$/.test(yearParam)) {
    return { success: false, response: validationResponse('Invalid year', 'year') }
  }
  if (monthParam !== 'all' && !/^(?:[1-9]|1[0-2])$/.test(monthParam)) {
    return { success: false, response: validationResponse('Invalid month', 'month') }
  }
  if (hasDateRange && (yearParam !== 'all' || monthParam !== 'all')) {
    return {
      success: false,
      response: validationResponse('Use either startDate/endDate or year/month', 'startDate'),
    }
  }
  if (hasDateRange && !selectedDateRange(startDate, endDate)) {
    return { success: false, response: validationResponse('Invalid ordered date range', 'startDate') }
  }

  // Ignore legacy seed rows whose required Project record is missing.
  const filters = baseWorkItemFilter(searchParams, ownerInternalId, ownerPublicId)
  if ('error' in filters) {
    return { success: false, response: validationResponse(filters.error) }
  }

  const filterHash = workItemFilterHash(searchParams, yearParam, monthParam, search, filters.overdueAsOf)
  const cursorParam = searchParams.get('cursor')
  const cursor = cursorParam === null ? null : decodeCursor(cursorParam, ownerPublicId, filterHash)
  if (cursorParam !== null && !cursor) {
    return {
      success: false,
      response: validationResponse('Invalid cursor for the selected filters', 'cursor'),
    }
  }

  return {
    success: true,
    query: {
      ownerId: ownerInternalId,
      ownerPublicId,
      projectPublicId: filters.projectPublicId,
      companyPublicId: filters.companyPublicId,
      yearParam,
      monthParam,
      startDate,
      endDate,
      search,
      includeYears,
      limit,
      cursor,
      filterHash,
      overdueAsOf: filters.overdueAsOf,
      where: filters.where,
    },
  }
}

export async function queryWorkItemList({
  ownerId,
  ownerPublicId,
  projectPublicId,
  companyPublicId,
  yearParam,
  monthParam,
  startDate,
  endDate,
  search,
  includeYears,
  limit,
  cursor,
  filterHash,
  overdueAsOf,
  where,
}: WorkItemListQuery) {
  if (projectPublicId) {
    const project = await projects.byPublicId(projectPublicId)
    if (!project) return { missing: 'projectId' as const }
    where = and(where, sql`w.project_id=${project.id}`)
  }
  if (companyPublicId) {
    const company = await companies.byPublicId(companyPublicId)
    if (!company) return { missing: 'companyId' as const }
    where = and(where, sql`p.company_id=${company.id}`)
  }
  const shouldIncludeYears = includeYears || (yearParam === 'all' && monthParam !== 'all')
  const period =
    startDate && endDate
      ? { clause: selectedDateRange(startDate, endDate), availableYears: undefined }
      : await periodFilter(yearParam, monthParam, ownerId)
  const { clause, availableYears } = period
  const filteredWhere = and(where, clause, search ? searchClause(search) : null)
  const pageWhere = and(filteredWhere, cursor ? cursorClause(cursor) : null)
  const todayStart = new Date(`${overdueAsOf ?? currentBangkokCalendarDate()}T00:00:00.000Z`)
  const [rows, years, total, inProgress, completed, overdue, incident, issue, task] = await Promise.all([
    workItems.list(pageWhere, undefined, limit + 1),
    shouldIncludeYears && !availableYears ? getAvailableYears(ownerId) : Promise.resolve(availableYears),
    workItems.count(filteredWhere),
    workItems.count(and(filteredWhere, sql`w.status='in-progress'`)),
    workItems.count(and(filteredWhere, sql`w.status='completed'`)),
    workItems.count(
      and(filteredWhere, sql`w.due_date<${todayStart} AND w.status NOT IN ('completed','cancelled')`),
    ),
    workItems.count(and(filteredWhere, sql`w.kind='Incident'`)),
    workItems.count(and(filteredWhere, sql`w.kind='Issue'`)),
    workItems.count(and(filteredWhere, sql`w.kind='Task'`)),
  ])
  const hasNextPage = rows.length > limit
  const pageItems = rows.slice(0, limit)
  const nextCursor = hasNextPage
    ? encodeCursor(pageItems[pageItems.length - 1], ownerPublicId, filterHash)
    : null
  if (hasNextPage && !nextCursor) throw new Error('Cursor secret unavailable')

  return {
    workItems: pageItems.map(serializeWorkItem),
    page: { limit, nextCursor },
    summary: {
      total,
      inProgress,
      completed,
      overdue,
      kinds: { Incident: incident, Issue: issue, Task: task },
    },
    ...(years ? { years } : {}),
  }
}
