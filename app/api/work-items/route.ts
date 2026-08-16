import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import {
  DEFAULT_ASSIGNEE_ID,
  isWorkItemKind,
  isWorkItemPriority,
  isWorkItemRole,
  parseWorkItemStatus,
  parseWorkItemTypes,
  serializeWorkItemStatus,
  shouldStampSubmittedAt,
} from '@/lib/work-items'
import type { Prisma, WorkItemStatus } from '@prisma/client'

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
    },
  },
} as const

function serializeWorkItem<T extends { status: WorkItemStatus }>(item: T) {
  return {
    ...item,
    status: serializeWorkItemStatus(item.status),
  }
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

    const where: Prisma.WorkItemWhereInput = {}
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

    const workItems = await prisma.workItem.findMany({
      where,
      include: workItemInclude,
      orderBy: { createdAt: 'desc' },
    })

    return NextResponse.json(
      { workItems: workItems.map(serializeWorkItem) },
      { status: 200 },
    )
  } catch (error) {
    console.error('Error fetching work items:', error)
    return NextResponse.json(
      { error: 'Failed to fetch work items' },
      { status: 500 },
    )
  }
}

// POST /api/work-items
export async function POST(request: Request) {
  try {
    const body = await request.json()
    const {
      title,
      description,
      kind,
      priority,
      role,
      status: statusParam,
      types,
      workDate,
      dueDate,
      projectId,
      assigneeId,
    } = body

    if (!title || !projectId) {
      return NextResponse.json(
        { error: 'Title and project ID are required' },
        { status: 400 },
      )
    }

    if (!isWorkItemKind(kind)) {
      return NextResponse.json(
        { error: 'kind must be Incident, Issue, or Task' },
        { status: 400 },
      )
    }

    const status = statusParam === undefined || statusParam === null
      ? 'backlog'
      : parseWorkItemStatus(statusParam)
    if (!status) {
      return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
    }

    const parsedPriority = priority ?? 'none'
    if (!isWorkItemPriority(parsedPriority)) {
      return NextResponse.json({ error: 'Invalid priority' }, { status: 400 })
    }

    let parsedRole = role === undefined || role === null || role === '' ? null : role
    if (parsedRole !== null && !isWorkItemRole(parsedRole)) {
      return NextResponse.json({ error: 'Invalid role' }, { status: 400 })
    }

    const parsedTypes = parseWorkItemTypes(types)
    if (parsedTypes === null) {
      return NextResponse.json({ error: 'Invalid types' }, { status: 400 })
    }

    const resolvedAssigneeId = assigneeId || DEFAULT_ASSIGNEE_ID

    const [project, assignee] = await Promise.all([
      prisma.project.findUnique({ where: { id: projectId }, select: { id: true } }),
      prisma.user.findUnique({ where: { id: resolvedAssigneeId }, select: { id: true } }),
    ])

    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }
    if (!assignee) {
      return NextResponse.json({ error: 'Assignee not found' }, { status: 404 })
    }

    const workItem = await prisma.workItem.create({
      data: {
        title,
        description: description || null,
        kind,
        priority: parsedPriority,
        role: parsedRole,
        status,
        types: parsedTypes,
        workDate: workDate ? new Date(workDate) : null,
        dueDate: dueDate ? new Date(dueDate) : null,
        submittedAt: shouldStampSubmittedAt(status) ? new Date() : null,
        projectId,
        assigneeId: resolvedAssigneeId,
      },
      include: workItemInclude,
    })

    return NextResponse.json(
      { workItem: serializeWorkItem(workItem) },
      { status: 201 },
    )
  } catch (error) {
    console.error('Error creating work item:', error)
    return NextResponse.json(
      { error: 'Failed to create work item' },
      { status: 500 },
    )
  }
}
