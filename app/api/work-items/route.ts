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
import { currentBangkokCalendarDate, currentBangkokWallClockDate } from '@/lib/bangkok-datetime'
import { serializeWorkItem, workItemInclude } from '@/lib/work-item-response'
import { createHash } from 'node:crypto'

type WorkItemYearRow = { year: number }
type WorkItemCursor = { id: string; createdAt: Date }
type WorkItemListQuery = {
  ownerId: string
  yearParam: string
  monthParam: string
  search: string
  includeYears: boolean
  limit: number
  cursor: WorkItemCursor | null
  filterHash: string
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

async function getAvailableYears(ownerId: string) {
  const rows = await prisma.$queryRaw<WorkItemYearRow[]>(Prisma.sql`
    SELECT DISTINCT EXTRACT(YEAR FROM COALESCE(wi."workDate", wi."dueDate", wi."createdAt"))::int AS year
    FROM "work_items" AS wi
    INNER JOIN "Project" AS p ON p."id" = wi."projectId"
    WHERE wi."assigneeId" = ${ownerId}
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

type WorkItemFilterResult = { where: Prisma.WorkItemWhereInput } | { error: string }

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

function baseWorkItemFilter(searchParams: URLSearchParams, ownerId: string): WorkItemFilterResult {
  const where: Prisma.WorkItemWhereInput = { project: { is: {} }, assigneeId: ownerId }
  const projectId = searchParams.get('projectId')
  const assigneeId = searchParams.get('assigneeId')
  const kind = searchParams.get('kind')
  const statusParam = searchParams.get('status')
  const priority = searchParams.get('priority')
  const role = searchParams.get('role')
  const companyId = searchParams.get('companyId')

  const validationError = validateAssigneeFilter(assigneeId, ownerId)
    ?? applyKindFilter(where, kind)
    ?? applyStatusFilter(where, statusParam)
    ?? applyPriorityFilter(where, priority)
    ?? applyRoleFilter(where, role)
  if (validationError) return { error: validationError }

  if (projectId) where.projectId = projectId
  if (companyId) where.project = { is: { companyId } }
  return { where }
}

async function periodFilter(yearParam: string, monthParam: string, ownerId: string) {
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
    : { id: '__no_work_items_in_selected_period__' }
  return { clause, availableYears }
}

function parsePageLimit(value: string | null) {
  if (value === null) return DEFAULT_PAGE_LIMIT
  if (!/^\d+$/.test(value)) return null
  const limit = Number(value)
  return limit >= 1 && limit <= MAX_PAGE_LIMIT ? limit : null
}

function workItemFilterHash(searchParams: URLSearchParams, year: string, month: string, search: string) {
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
    search,
    order: 'createdAt-desc-id-desc',
  }
  return createHash('sha256').update(JSON.stringify(filters)).digest('hex')
}

function encodeCursor(item: { id: string; createdAt: Date }, filterHash: string) {
  return Buffer.from(JSON.stringify({
    version: 1,
    id: item.id,
    createdAt: item.createdAt.toISOString(),
    filterHash,
  })).toString('base64url')
}

function decodeCursor(value: string, expectedFilterHash: string): WorkItemCursor | null {
  try {
    const payload: unknown = JSON.parse(Buffer.from(value, 'base64url').toString('utf8'))
    if (typeof payload !== 'object' || payload === null) return null
    if (!('version' in payload) || payload.version !== 1) return null
    if (!('id' in payload) || typeof payload.id !== 'string' || payload.id.length === 0) return null
    if (!('createdAt' in payload) || typeof payload.createdAt !== 'string') return null
    if (!('filterHash' in payload) || payload.filterHash !== expectedFilterHash) return null

    const createdAt = new Date(payload.createdAt)
    if (Number.isNaN(createdAt.getTime())) return null
    return { id: payload.id, createdAt }
  } catch {
    return null
  }
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

function parseWorkItemListQuery(searchParams: URLSearchParams, ownerId: string): WorkItemListQueryResult {
  const yearParam = searchParams.get('year') ?? currentBangkokCalendarDate().slice(0, 4)
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

  // Ignore legacy seed rows whose required Project record is missing.
  const filters = baseWorkItemFilter(searchParams, ownerId)
  if ('error' in filters) {
    return { success: false, response: validationResponse(filters.error) }
  }

  const filterHash = workItemFilterHash(searchParams, yearParam, monthParam, search)
  const cursorParam = searchParams.get('cursor')
  const cursor = cursorParam === null ? null : decodeCursor(cursorParam, filterHash)
  if (cursorParam !== null && !cursor) {
    return { success: false, response: validationResponse('Invalid cursor for the selected filters', 'cursor') }
  }

  return {
    success: true,
    query: {
      ownerId,
      yearParam,
      monthParam,
      search,
      includeYears,
      limit,
      cursor,
      filterHash,
      where: filters.where,
    },
  }
}

async function queryWorkItemList({
  ownerId,
  yearParam,
  monthParam,
  search,
  includeYears,
  limit,
  cursor,
  filterHash,
  where,
}: WorkItemListQuery) {
  const shouldIncludeYears = includeYears || (yearParam === 'all' && monthParam !== 'all')
  const { clause, availableYears } = await periodFilter(yearParam, monthParam, ownerId)
  const and: Prisma.WorkItemWhereInput[] = [
    ...(clause ? [clause] : []),
    ...(search ? [searchClause(search)] : []),
  ]
  const filteredWhere: Prisma.WorkItemWhereInput = and.length > 0 ? { ...where, AND: and } : where
  const pageWhere: Prisma.WorkItemWhereInput = cursor
    ? { ...filteredWhere, AND: [...and, cursorClause(cursor)] }
    : filteredWhere
  const todayStart = new Date(`${currentBangkokCalendarDate()}T00:00:00.000Z`)

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
  const nextCursor = hasNextPage ? encodeCursor(workItems[workItems.length - 1], filterHash) : null

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
    const parsed = parseWorkItemListQuery(new URL(request.url).searchParams, owner.id)
    if (!parsed.success) return parsed.response
    return NextResponse.json(await queryWorkItemList(parsed.query), { status: 200 })
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

    const input = { ...result.data }
    delete input.id

    const project = await prisma.project.findUnique({ where: { id: input.projectId }, select: { id: true } })

    if (!project) {
      return NextResponse.json({ error: { code: 'NOT_FOUND', message: 'Project not found', field: 'projectId' } }, { status: 404 })
    }

    const now = currentBangkokWallClockDate()
    const workItem = await prisma.workItem.create({
      data: {
        ...input,
        submittedAt: shouldStampSubmittedAt(input.status) ? now : null,
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
