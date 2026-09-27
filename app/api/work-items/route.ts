import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import {
  WORK_ITEM_KINDS,
  WORK_ITEM_STATUSES,
  isWorkItemKind,
  isWorkItemPriority,
  parseWorkItemStatus,
  serializeWorkItemStatus,
  shouldStampSubmittedAt,
} from '@/lib/work-items'
import { parseWorkItemInput } from '@/lib/work-item-input'
import { Prisma, type WorkItemStatus } from '@prisma/client'

const workItemInclude = {
  assignee: {
    select: {
      id: true,
      name: true,
      email: true,
      avatar: true,
    },
  },
  project: {
    select: {
      id: true,
      name: true,
      colorProject: true,
    },
  },
} as const

function serializeWorkItem<T extends { status: WorkItemStatus }>(item: T) {
  return {
    ...item,
    status: serializeWorkItemStatus(item.status),
  }
}

type WorkItemYearRow = { year: number }

async function getAvailableYears() {
  const rows = await prisma.$queryRaw<WorkItemYearRow[]>(Prisma.sql`
    SELECT DISTINCT EXTRACT(YEAR FROM COALESCE(wi."workDate", wi."dueDate", wi."createdAt"))::int AS year
    FROM "work_items" AS wi
    INNER JOIN "Project" AS p ON p."id" = wi."projectId"
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

function searchClause(query: string): Prisma.WorkItemWhereInput {
  const clauses: Prisma.WorkItemWhereInput[] = [
    { title: { contains: query, mode: 'insensitive' } },
    { description: { contains: query, mode: 'insensitive' } },
    { project: { is: { name: { contains: query, mode: 'insensitive' } } } },
    { assignee: { is: { name: { contains: query, mode: 'insensitive' } } } },
  ]

  const normalizedQuery = query.toLowerCase()
  for (const kind of WORK_ITEM_KINDS) {
    if (kind.toLowerCase().includes(normalizedQuery)) clauses.push({ kind })
  }
  for (const statusValue of WORK_ITEM_STATUSES) {
    if (statusValue.toLowerCase().includes(normalizedQuery)) {
      const status = parseWorkItemStatus(statusValue)
      if (status) clauses.push({ status })
    }
  }

  return { OR: clauses }
}

// GET /api/work-items
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const projectId = searchParams.get('projectId')
    const assigneeId = searchParams.get('assigneeId')
    const kind = searchParams.get('kind')
    const statusParam = searchParams.get('status')
    const priority = searchParams.get('priority')
    const yearParam = searchParams.get('year') ?? 'all'
    const monthParam = searchParams.get('month') ?? 'all'
    const search = searchParams.get('search')?.trim() ?? ''
    const includeYears = searchParams.get('includeYears') === 'true'

    if (yearParam !== 'all' && !/^\d{4}$/.test(yearParam)) {
      return NextResponse.json({ error: 'Invalid year' }, { status: 400 })
    }
    if (monthParam !== 'all' && !/^(?:[1-9]|1[0-2])$/.test(monthParam)) {
      return NextResponse.json({ error: 'Invalid month' }, { status: 400 })
    }

    // Ignore legacy seed rows whose required Project record is missing.
    const where: Prisma.WorkItemWhereInput = { project: { is: {} } }
    const and: Prisma.WorkItemWhereInput[] = []
    if (projectId) where.projectId = projectId
    if (assigneeId) where.assigneeId = assigneeId
    if (kind) {
      if (!isWorkItemKind(kind)) {
        return NextResponse.json({ error: 'Invalid kind' }, { status: 400 })
      }
      where.kind = kind
    }
    if (statusParam) {
      const status = parseWorkItemStatus(statusParam)
      if (!status) {
        return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
      }
      where.status = status
    }
    if (priority) {
      if (!isWorkItemPriority(priority)) {
        return NextResponse.json({ error: 'Invalid priority' }, { status: 400 })
      }
      where.priority = priority
    }

    const shouldIncludeYears = includeYears || (yearParam === 'all' && monthParam !== 'all')
    let availableYears: string[] | undefined

    if (yearParam !== 'all' || monthParam !== 'all') {
      const month = monthParam === 'all' ? null : Number(monthParam)
      const years = yearParam === 'all'
        ? (availableYears = await getAvailableYears()).map(Number)
        : [Number(yearParam)]
      const dateRanges = years.flatMap((year) => dateRangeFor(year, month))
      and.push(dateRanges.length > 0 ? { OR: dateRanges } : { id: '__no_work_items_in_selected_period__' })
    }

    if (search) and.push(searchClause(search))
    if (and.length > 0) where.AND = and

    const [workItems, years] = await Promise.all([
      prisma.workItem.findMany({
        where,
        include: workItemInclude,
        orderBy: { createdAt: 'desc' },
      }),
      shouldIncludeYears && !availableYears ? getAvailableYears() : Promise.resolve(availableYears),
    ])

    return NextResponse.json(
      { workItems: workItems.map(serializeWorkItem), ...(years ? { years } : {}) },
      { status: 200 },
    )
  } catch (error) {
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
    const result = parseWorkItemInput(await request.json())
    if ('error' in result) {
      return NextResponse.json({ error: result.error }, { status: 400 })
    }

    const { id, ...input } = result.data
    void id

    const [project, assignee] = await Promise.all([
      prisma.project.findUnique({ where: { id: input.projectId }, select: { id: true } }),
      prisma.user.findUnique({ where: { id: input.assigneeId }, select: { id: true } }),
    ])

    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }
    if (!assignee) {
      return NextResponse.json({ error: 'Assignee not found' }, { status: 404 })
    }

    const workItem = await prisma.workItem.create({
      data: {
        ...input,
        submittedAt: shouldStampSubmittedAt(input.status) ? new Date() : null,
      },
      include: workItemInclude,
    })

    return NextResponse.json(
      { workItem: serializeWorkItem(workItem) },
      { status: 201 },
    )
  } catch (error) {
    console.error('Error creating work item:')
    return NextResponse.json(
      { error: 'Failed to create work item' },
      { status: 500 },
    )
  }
}
