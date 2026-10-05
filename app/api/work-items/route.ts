import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
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
  shouldStampSubmittedAt,
} from '@/lib/work-items'
import { parseWorkItemInput } from '@/lib/work-item-input'
import { Prisma } from '@prisma/client'
import { getOwner, ownerErrorResponse } from '@/lib/owner'
import { bangkokDateRange, currentBangkokCalendarDate, currentBangkokWallClockDate } from '@/lib/bangkok-datetime'
import { serializeWorkItem, workItemInclude } from '@/lib/work-item-response'
import { createHash } from 'node:crypto'
import { encodeOpaqueCursor, decodeOpaqueCursor } from '@/lib/opaque-cursor'
import { parsePublicId } from '@/lib/public-id'

type WorkItemYearRow = { year: number }
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
  where: Prisma.WorkItemWhereInput
}
type WorkItemListQueryResult = { success: true; query: WorkItemListQuery } | { success: false; response: NextResponse }

const DEFAULT_PAGE_LIMIT = 50
const MAX_PAGE_LIMIT = 200

function hasErrorCode(error: unknown, code: string) {
  return typeof error === 'object'
    && error !== null
    && 'code' in error
    && error.code === code
}

async function getAvailableYears(ownerId: bigint) {
  const rows = await prisma.$queryRaw<WorkItemYearRow[]>(Prisma.sql`
    SELECT DISTINCT EXTRACT(YEAR FROM COALESCE(wi."work_date", wi."due_date", wi."created_at"))::int AS year
    FROM "work_items" AS wi
    INNER JOIN "projects" AS p ON p."id" = wi."project_id"
    WHERE wi."assignee_id" = ${ownerId}
    ORDER BY year DESC
  `)

  return rows.map(({ year }) => String(year))
}

function dateRangeFor(year: number, month: number | null) {
  const start = new Date(Date.UTC(year, month === null ? 0 : month - 1, 1))
  const end = month === null
    ? new Date(Date.UTC(year + 1, 0, 1))
    : new Date(Date.UTC(year, month, 1))

  return [
    { workDate: { gte: start, lt: end } },
    { workDate: null, dueDate: { gte: start, lt: end } },
    { workDate: null, dueDate: null, createdAt: { gte: start, lt: end } },
  ] satisfies Prisma.WorkItemWhereInput[]
}

function matchingWorkItemSearchClauses<T>(
  values: readonly T[],
  normalizedQuery: string,
  getSearchText: (value: T) => string,
  toClause: (value: T) => Prisma.WorkItemWhereInput | null,
): Prisma.WorkItemWhereInput[] {
  return values
    .filter((value) => getSearchText(value).includes(normalizedQuery))
    .map(toClause)
    .filter((clause): clause is Prisma.WorkItemWhereInput => clause !== null)
}

function searchClause(query: string): Prisma.WorkItemWhereInput {
  const normalizedQuery = query.toLowerCase()
  const clauses: Prisma.WorkItemWhereInput[] = [
    { title: { contains: query, mode: 'insensitive' } },
    { description: { contains: query, mode: 'insensitive' } },
    { project: { is: { name: { contains: query, mode: 'insensitive' } } } },
    { project: { is: { company: { is: { name: { contains: query, mode: 'insensitive' } } } } } },
    { project: { is: { company: { is: { displayName: { contains: query, mode: 'insensitive' } } } } } },
    { assignee: { is: { name: { contains: query, mode: 'insensitive' } } } },
    ...matchingWorkItemSearchClauses(
      WORK_ITEM_KINDS,
      normalizedQuery,
      (kind) => kind.toLowerCase(),
      (kind) => ({ kind }),
    ),
    ...matchingWorkItemSearchClauses(
      WORK_ITEM_STATUSES,
      normalizedQuery,
      (status) => status.toLowerCase(),
      (statusValue) => {
        const status = parseWorkItemStatus(statusValue)
        return status ? { status } : null
      },
    ),
    ...matchingWorkItemSearchClauses(
      WORK_ITEM_PRIORITIES,
      normalizedQuery,
      (priority) => priority.toLowerCase(),
      (priority) => ({ priority }),
    ),
    ...matchingWorkItemSearchClauses(
      WORK_ITEM_ROLES,
      normalizedQuery,
      (role) => role.toLowerCase(),
      (role) => ({ role }),
    ),
    ...matchingWorkItemSearchClauses(
      WORK_ITEM_TYPES,
      normalizedQuery,
      (type) => type,
      (type) => ({ types: { has: type } }),
    ),
  ]

  return { OR: clauses }
}

type WorkItemFilterResult = {
  where: Prisma.WorkItemWhereInput
  overdueAsOf: string | null
  projectPublicId: string | null
  companyPublicId: string | null
} | { error: string }

function readFilterPublicId(value: string | null, field: string): { publicId: string | null } | { error: string } {
  if (!value) return { publicId: null }
  const publicId = parsePublicId(value)
  if (!publicId) return { error: `Invalid ${field}` }
  return { publicId }
}

function validateAssigneeFilter(assigneeId: string | null, ownerId: string) {
  return assigneeId && assigneeId !== ownerId ? 'assigneeId ต้องเป็นเจ้าของระบบ' : null
}

function applyKindFilter(where: Prisma.WorkItemWhereInput, kind: string | null) {
  if (!kind) return null
  if (!isWorkItemKind(kind)) return 'Invalid kind'
  where.kind = kind
  return null
}

function applyStatusFilter(where: Prisma.WorkItemWhereInput, statusParam: string | null) {
  if (!statusParam) return null
  const status = parseWorkItemStatus(statusParam)
  if (!status) return 'Invalid status'
  where.status = status
  return null
}

function applyPriorityFilter(where: Prisma.WorkItemWhereInput, priority: string | null) {
  if (!priority) return null
  if (!isWorkItemPriority(priority)) return 'Invalid priority'
  where.priority = priority
  return null
}

function applyRoleFilter(where: Prisma.WorkItemWhereInput, role: string | null) {
  if (!role) return null
  if (role === 'none') {
    where.role = null
    return null
  }
  if (!isWorkItemRole(role)) return 'Invalid role'
  where.role = role
  return null
}

function baseWorkItemFilter(searchParams: URLSearchParams, ownerInternalId: bigint, ownerPublicId: string): WorkItemFilterResult {
  const where: Prisma.WorkItemWhereInput = { project: { is: {} }, assigneeId: ownerInternalId }
  const projectId = searchParams.get('projectId')
  const assigneeId = searchParams.get('assigneeId')
  const kind = searchParams.get('kind')
  const statusParam = searchParams.get('status')
  const priority = searchParams.get('priority')
  const role = searchParams.get('role')
  const companyId = searchParams.get('companyId')
  const openOnly = searchParams.get('openOnly')
  const overdueOnly = searchParams.get('overdue')

  if (openOnly !== null && openOnly !== 'true' && openOnly !== 'false') return { error: 'Invalid openOnly filter' }
  if (overdueOnly !== null && overdueOnly !== 'true' && overdueOnly !== 'false') return { error: 'Invalid overdue filter' }

  const projectRef = readFilterPublicId(projectId, 'projectId')
  if ('error' in projectRef) return projectRef
  const companyRef = readFilterPublicId(companyId, 'companyId')
  if ('error' in companyRef) return companyRef
  const validationError = validateAssigneeFilter(assigneeId, ownerPublicId)
    ?? applyKindFilter(where, kind)
    ?? applyStatusFilter(where, statusParam)
    ?? applyPriorityFilter(where, priority)
    ?? applyRoleFilter(where, role)
  if (validationError) return { error: validationError }
  const clauses: Prisma.WorkItemWhereInput[] = []
  let overdueAsOf: string | null = null
  if (openOnly === 'true') clauses.push({ status: { notIn: ['completed', 'cancelled'] } })
  if (overdueOnly === 'true') {
    overdueAsOf = currentBangkokCalendarDate()
    const today = bangkokDateRange(overdueAsOf)
    if (!today) return { error: 'Invalid Bangkok business date' }
    clauses.push({ dueDate: { lt: today.start } }, { status: { notIn: ['completed', 'cancelled'] } })
  }
  if (clauses.length > 0) where.AND = clauses
  return { where, overdueAsOf, projectPublicId: projectRef.publicId, companyPublicId: companyRef.publicId }
}

function selectedDateRange(startDate: string, endDate: string): Prisma.WorkItemWhereInput | null {
  const start = bangkokDateRange(startDate)
  const end = bangkokDateRange(endDate)
  if (!start || !end || end.start < start.start) return null
  return {
    OR: [
      { workDate: { gte: start.start, lt: end.end } },
      { workDate: null, dueDate: { gte: start.start, lt: end.end } },
      { workDate: null, dueDate: null, createdAt: { gte: start.start, lt: end.end } },
    ],
  }
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
  const clause: Prisma.WorkItemWhereInput = dateRanges.length > 0
    ? { OR: dateRanges }
    : { id: { in: [] } }
  return { clause, availableYears }
}

function parsePageLimit(value: string | null) {
  if (value === null) return DEFAULT_PAGE_LIMIT
  if (!/^\d+$/.test(value)) return null
  const limit = Number(value)
  return limit >= 1 && limit <= MAX_PAGE_LIMIT ? limit : null
}

function workItemFilterHash(searchParams: URLSearchParams, year: string, month: string, search: string, overdueAsOf: string | null) {
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

function decodeCursor(value: string, ownerPublicId: string, expectedFilterHash: string): WorkItemCursor | null {
  const decoded = decodeOpaqueCursor(value, { ownerPublicId, filterHash: expectedFilterHash })
  if (!decoded) return null
  const createdAt = new Date(decoded.tieBreaker)
  if (Number.isNaN(createdAt.getTime())) return null
  return { id: decoded.internalId, createdAt }
}

function cursorClause(cursor: WorkItemCursor): Prisma.WorkItemWhereInput {
  return {
    OR: [
      { createdAt: { lt: cursor.createdAt } },
      { createdAt: cursor.createdAt, id: { lt: cursor.id } },
    ],
  }
}

function validationResponse(message: string, field?: string) {
  return NextResponse.json({
    error: { code: 'VALIDATION_ERROR', message, ...(field ? { field } : {}) },
  }, { status: 400 })
}

function parseWorkItemListQuery(searchParams: URLSearchParams, ownerPublicId: string, ownerInternalId: bigint): WorkItemListQueryResult {
  const startDate = searchParams.get('startDate')
  const endDate = searchParams.get('endDate')
  if ((startDate === null) !== (endDate === null)) {
    return { success: false, response: validationResponse('startDate and endDate must be provided together', 'startDate') }
  }
  const hasDateRange = startDate !== null && endDate !== null
  const yearParam = searchParams.get('year') ?? (hasDateRange ? 'all' : currentBangkokCalendarDate().slice(0, 4))
  const monthParam = searchParams.get('month') ?? 'all'
  const search = searchParams.get('search')?.trim() ?? ''
  const includeYears = searchParams.get('includeYears') === 'true'
  const limit = parsePageLimit(searchParams.get('limit'))

  if (limit === null) return { success: false, response: validationResponse('limit must be between 1 and 200', 'limit') }
  if (yearParam !== 'all' && !/^\d{4}$/.test(yearParam)) {
    return { success: false, response: validationResponse('Invalid year', 'year') }
  }
  if (monthParam !== 'all' && !/^(?:[1-9]|1[0-2])$/.test(monthParam)) {
    return { success: false, response: validationResponse('Invalid month', 'month') }
  }
  if (hasDateRange && (yearParam !== 'all' || monthParam !== 'all')) {
    return { success: false, response: validationResponse('Use either startDate/endDate or year/month', 'startDate') }
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
    return { success: false, response: validationResponse('Invalid cursor for the selected filters', 'cursor') }
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

async function queryWorkItemList({
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
    const project = await prisma.project.findUnique({ where: { publicId: projectPublicId }, select: { id: true } })
    if (!project) return { missing: 'projectId' as const }
    where.projectId = project.id
  }
  if (companyPublicId) {
    const company = await prisma.company.findUnique({ where: { publicId: companyPublicId }, select: { id: true } })
    if (!company) return { missing: 'companyId' as const }
    where.project = { is: { companyId: company.id } }
  }
  const shouldIncludeYears = includeYears || (yearParam === 'all' && monthParam !== 'all')
  const period = startDate && endDate
    ? { clause: selectedDateRange(startDate, endDate), availableYears: undefined }
    : await periodFilter(yearParam, monthParam, ownerId)
  const { clause, availableYears } = period
  const baseClauses = Array.isArray(where.AND) ? where.AND : where.AND ? [where.AND] : []
  const and: Prisma.WorkItemWhereInput[] = [
    ...baseClauses,
    ...(clause ? [clause] : []),
    ...(search ? [searchClause(search)] : []),
  ]
  const filteredWhere: Prisma.WorkItemWhereInput = and.length > 0 ? { ...where, AND: and } : where
  const pageWhere: Prisma.WorkItemWhereInput = cursor
    ? { ...filteredWhere, AND: [...and, cursorClause(cursor)] }
    : filteredWhere
  const todayStart = new Date(`${overdueAsOf ?? currentBangkokCalendarDate()}T00:00:00.000Z`)

  const [rows, years, total, inProgress, completed, overdue, incident, issue, task] = await Promise.all([
    prisma.workItem.findMany({
      where: pageWhere,
      include: workItemInclude,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
    }),
    shouldIncludeYears && !availableYears ? getAvailableYears(ownerId) : Promise.resolve(availableYears),
    prisma.workItem.count({ where: filteredWhere }),
    prisma.workItem.count({ where: { AND: [filteredWhere, { status: 'in_progress' }] } }),
    prisma.workItem.count({ where: { AND: [filteredWhere, { status: 'completed' }] } }),
    prisma.workItem.count({
      where: { AND: [filteredWhere, { dueDate: { lt: todayStart } }, { status: { notIn: ['completed', 'cancelled'] } }] },
    }),
    prisma.workItem.count({ where: { AND: [filteredWhere, { kind: 'Incident' }] } }),
    prisma.workItem.count({ where: { AND: [filteredWhere, { kind: 'Issue' }] } }),
    prisma.workItem.count({ where: { AND: [filteredWhere, { kind: 'Task' }] } }),
  ])
  const hasNextPage = rows.length > limit
  const workItems = rows.slice(0, limit)
  const nextCursor = hasNextPage ? encodeCursor(workItems[workItems.length - 1], ownerPublicId, filterHash) : null
  if (hasNextPage && !nextCursor) throw new Error('Cursor secret unavailable')

  return {
    workItems: workItems.map(serializeWorkItem),
    page: { limit, nextCursor },
    summary: { total, inProgress, completed, overdue, kinds: { Incident: incident, Issue: issue, Task: task } },
    ...(years ? { years } : {}),
  }
}

// GET /api/work-items
export async function GET(request: Request) {
  try {
    const owner = await getOwner()
    const parsed = parseWorkItemListQuery(new URL(request.url).searchParams, owner.id, owner.internalId)
    if (!parsed.success) return parsed.response
    const listed = await queryWorkItemList(parsed.query)
    if ('missing' in listed) {
      return NextResponse.json({
        error: { code: 'NOT_FOUND', message: 'ไม่พบข้อมูลที่อ้างอิง', field: listed.missing },
      }, { status: 404 })
    }
    return NextResponse.json(listed, { status: 200 })
  } catch (error) {
    const ownerError = ownerErrorResponse(error)
    if (ownerError) return ownerError
    console.error('Error fetching work items:')
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch work items' } },
      { status: 500 },
    )
  }
}

// POST /api/work-items
export async function POST(request: Request) {
  try {
    const owner = await getOwner()
    let body: unknown
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: { code: 'VALIDATION_ERROR', message: 'Request body must be valid JSON' } }, { status: 400 })
    }
    const result = parseWorkItemInput(body, owner.id)
    if ('error' in result) {
      return NextResponse.json({ error: { code: 'VALIDATION_ERROR', message: result.error } }, { status: 400 })
    }

    if (result.data.id) {
      return NextResponse.json({ error: { code: 'VALIDATION_ERROR', message: 'id is generated by the database', field: 'id' } }, { status: 400 })
    }
    const projectPublicId = parsePublicId(result.data.projectId)
    if (!projectPublicId) {
      return NextResponse.json({ error: { code: 'VALIDATION_ERROR', message: 'ต้องเป็น public UUID', field: 'projectId' } }, { status: 400 })
    }
    const project = await prisma.project.findUnique({ where: { publicId: projectPublicId }, select: { id: true } })

    if (!project) {
      return NextResponse.json({ error: { code: 'NOT_FOUND', message: 'Project not found', field: 'projectId' } }, { status: 404 })
    }

    const now = currentBangkokWallClockDate()
    const workItem = await prisma.workItem.create({
      data: {
        title: result.data.title,
        description: result.data.description,
        kind: result.data.kind,
        priority: result.data.priority,
        role: result.data.role,
        status: result.data.status,
        types: result.data.types,
        workDate: result.data.workDate,
        dueDate: result.data.dueDate,
        projectId: project.id,
        assigneeId: owner.internalId,
        submittedAt: shouldStampSubmittedAt(result.data.status) ? now : null,
      },
      include: workItemInclude,
    })

    return NextResponse.json(
      { workItem: serializeWorkItem(workItem) },
      { status: 201 },
    )
  } catch (error) {
    const ownerError = ownerErrorResponse(error)
    if (ownerError) return ownerError
    if (hasErrorCode(error, 'P2003')) {
      return NextResponse.json({ error: { code: 'NOT_FOUND', message: 'Project not found', field: 'projectId' } }, { status: 404 })
    }
    console.error('Error creating work item:')
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'Failed to create work item' } },
      { status: 500 },
    )
  }
}
