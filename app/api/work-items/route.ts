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

type WorkItemYearRow = { year: number }

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

// GET /api/work-items
export async function GET(request: Request) {
  try {
    const owner = await getOwner()
    const { searchParams } = new URL(request.url)
    const yearParam = searchParams.get('year') ?? currentBangkokCalendarDate().slice(0, 4)
    const monthParam = searchParams.get('month') ?? 'all'
    const search = searchParams.get('search')?.trim() ?? ''
    const includeYears = searchParams.get('includeYears') === 'true'

    if (yearParam !== 'all' && !/^\d{4}$/.test(yearParam)) {
      return NextResponse.json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid year', field: 'year' } }, { status: 400 })
    }
    if (monthParam !== 'all' && !/^(?:[1-9]|1[0-2])$/.test(monthParam)) {
      return NextResponse.json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid month', field: 'month' } }, { status: 400 })
    }

    // Ignore legacy seed rows whose required Project record is missing.
    const filters = baseWorkItemFilter(searchParams, owner.id)
    if ('error' in filters) {
      return NextResponse.json({ error: { code: 'VALIDATION_ERROR', message: filters.error } }, { status: 400 })
    }
    const where = filters.where

    const shouldIncludeYears = includeYears || (yearParam === 'all' && monthParam !== 'all')
    const { clause, availableYears } = await periodFilter(yearParam, monthParam, owner.id)
    const and: Prisma.WorkItemWhereInput[] = []
    if (clause) and.push(clause)
    if (search) and.push(searchClause(search))
    if (and.length > 0) where.AND = and

    const [workItems, years] = await Promise.all([
      prisma.workItem.findMany({
        where,
        include: workItemInclude,
        orderBy: { createdAt: 'desc' },
      }),
      shouldIncludeYears && !availableYears ? getAvailableYears(owner.id) : Promise.resolve(availableYears),
    ])

    return NextResponse.json(
      { workItems: workItems.map(serializeWorkItem), ...(years ? { years } : {}) },
      { status: 200 },
    )
  } catch (error) {
    const ownerError = ownerErrorResponse(error)
    if (ownerError) return ownerError
    console.error('Error fetching work items:')
    return NextResponse.json(
      { error: 'Failed to fetch work items' },
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
      { error: 'Failed to create work item' },
      { status: 500 },
    )
  }
}
