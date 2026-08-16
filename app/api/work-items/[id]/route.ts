import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import {
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

type WorkItemPatchBody = {
  title?: unknown
  description?: unknown
  kind?: unknown
  priority?: unknown
  role?: unknown
  status?: unknown
  types?: unknown
  workDate?: unknown
  dueDate?: unknown
  projectId?: unknown
  assigneeId?: unknown
}

type WorkItemUpdateResult =
  | { ok: true; data: Prisma.WorkItemUpdateInput }
  | { ok: false; error: string }

function invalidUpdate(error: string): WorkItemUpdateResult {
  return { ok: false, error }
}

function toNullableDate(value: unknown): Date | null {
  if (!value) return null
  return new Date(value as string | number | Date)
}

function applyKind(kind: unknown): WorkItemUpdateResult {
  if (kind === undefined) return { ok: true, data: {} }
  if (!isWorkItemKind(kind)) return invalidUpdate('Invalid kind')
  return { ok: true, data: { kind } }
}

function applyPriority(priority: unknown): WorkItemUpdateResult {
  if (priority === undefined) return { ok: true, data: {} }
  if (!isWorkItemPriority(priority)) return invalidUpdate('Invalid priority')
  return { ok: true, data: { priority } }
}

function applyRole(role: unknown): WorkItemUpdateResult {
  if (role === undefined) return { ok: true, data: {} }
  if (role === null || role === '') return { ok: true, data: { role: null } }
  if (!isWorkItemRole(role)) return invalidUpdate('Invalid role')
  return { ok: true, data: { role } }
}

function applyStatus(
  statusParam: unknown,
  submittedAt: Date | null,
): WorkItemUpdateResult {
  if (statusParam === undefined) return { ok: true, data: {} }

  const status = parseWorkItemStatus(statusParam)
  if (!status) return invalidUpdate('Invalid status')

  const data: Prisma.WorkItemUpdateInput = { status }
  if (shouldStampSubmittedAt(status) && !submittedAt) {
    data.submittedAt = new Date()
  }
  return { ok: true, data }
}

function applyTypes(types: unknown): WorkItemUpdateResult {
  if (types === undefined) return { ok: true, data: {} }
  const parsedTypes = parseWorkItemTypes(types)
  if (parsedTypes === null) return invalidUpdate('Invalid types')
  return { ok: true, data: { types: parsedTypes } }
}

function applyOptionalScalars(body: WorkItemPatchBody): Prisma.WorkItemUpdateInput {
  const data: Prisma.WorkItemUpdateInput = {}
  if (body.title !== undefined) data.title = body.title as string
  if (body.description !== undefined) data.description = body.description as string | null
  if (body.workDate !== undefined) data.workDate = toNullableDate(body.workDate)
  if (body.dueDate !== undefined) data.dueDate = toNullableDate(body.dueDate)
  if (body.projectId !== undefined) {
    data.project = { connect: { id: body.projectId as string } }
  }
  if (body.assigneeId !== undefined) {
    data.assignee = { connect: { id: body.assigneeId as string } }
  }
  return data
}

function buildWorkItemUpdate(
  body: WorkItemPatchBody,
  submittedAt: Date | null,
): WorkItemUpdateResult {
  const data = applyOptionalScalars(body)
  const patches = [
    applyKind(body.kind),
    applyPriority(body.priority),
    applyRole(body.role),
    applyStatus(body.status, submittedAt),
    applyTypes(body.types),
  ]

  for (const patch of patches) {
    if (!patch.ok) return patch
    Object.assign(data, patch.data)
  }

  return { ok: true, data }
}

// GET /api/work-items/[id]
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const workItem = await prisma.workItem.findUnique({
      where: { id },
      include: workItemInclude,
    })

    if (!workItem) {
      return NextResponse.json({ error: 'Work item not found' }, { status: 404 })
    }

    return NextResponse.json(
      { workItem: serializeWorkItem(workItem) },
      { status: 200 },
    )
  } catch (error) {
    console.error('Error fetching work item:', error)
    return NextResponse.json(
      { error: 'Failed to fetch work item' },
      { status: 500 },
    )
  }
}

// PATCH /api/work-items/[id]
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const body = (await request.json()) as WorkItemPatchBody
    const existing = await prisma.workItem.findUnique({
      where: { id },
      select: { id: true, submittedAt: true },
    })

    if (!existing) {
      return NextResponse.json({ error: 'Work item not found' }, { status: 404 })
    }

    const result = buildWorkItemUpdate(body, existing.submittedAt)
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 400 })
    }

    const workItem = await prisma.workItem.update({
      where: { id },
      data: result.data,
      include: workItemInclude,
    })

    return NextResponse.json(
      { workItem: serializeWorkItem(workItem) },
      { status: 200 },
    )
  } catch (error) {
    console.error('Error updating work item:', error)
    return NextResponse.json(
      { error: 'Failed to update work item' },
      { status: 500 },
    )
  }
}

// DELETE /api/work-items/[id]
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    await prisma.workItem.delete({ where: { id } })
    return NextResponse.json(
      { message: 'Work item deleted successfully' },
      { status: 200 },
    )
  } catch (error) {
    console.error('Error deleting work item:', error)
    return NextResponse.json(
      { error: 'Failed to delete work item' },
      { status: 500 },
    )
  }
}
