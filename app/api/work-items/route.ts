import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import {
  isWorkItemKind,
  isWorkItemPriority,
  parseWorkItemStatus,
  serializeWorkItemStatus,
  shouldStampSubmittedAt,
} from '@/lib/work-items'
import { parseWorkItemInput } from '@/lib/work-item-input'
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

// GET /api/work-items
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const projectId = searchParams.get('projectId')
    const assigneeId = searchParams.get('assigneeId')
    const kind = searchParams.get('kind')
    const statusParam = searchParams.get('status')
    const priority = searchParams.get('priority')

    // Ignore legacy seed rows whose required Project record is missing.
    const where: Prisma.WorkItemWhereInput = { project: { is: {} } }
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
    console.error('Error creating work item:', error)
    return NextResponse.json(
      { error: 'Failed to create work item' },
      { status: 500 },
    )
  }
}
