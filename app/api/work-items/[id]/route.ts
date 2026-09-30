import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { shouldStampSubmittedAt } from '@/lib/work-items'
import { parseWorkItemPatch } from '@/lib/work-item-input'
import { currentBangkokWallClockDate } from '@/lib/bangkok-datetime'
import { serializeWorkItem, workItemDetailInclude, workItemInclude } from '@/lib/work-item-response'
import type { Prisma } from '@prisma/client'
import { getOwner, ownerErrorResponse } from '@/lib/owner'

type RouteContext = { params: Promise<{ id: string }> }

function validationError(message: string, field?: string) {
  return NextResponse.json({
    error: { code: 'VALIDATION_ERROR', message, ...(field ? { field } : {}) },
  }, { status: 400 })
}

function notFound(message: string) {
  return NextResponse.json({ error: { code: 'NOT_FOUND', message } }, { status: 404 })
}

function historyConflict() {
  return NextResponse.json({
    error: {
      code: 'HISTORY_CONFLICT',
      message: 'Work Item has linked Daily Work. Keep the Work Item to preserve its history.',
    },
  }, { status: 409 })
}

function hasErrorCode(error: unknown, code: string) {
  return typeof error === 'object'
    && error !== null
    && 'code' in error
    && error.code === code
}

// GET /api/work-items/[id]
export async function GET(_request: Request, { params }: RouteContext) {
  try {
    const owner = await getOwner()
    const { id } = await params
    const workItem = await prisma.workItem.findFirst({
      where: { id, assigneeId: owner.id, project: { is: {} } },
      include: workItemDetailInclude(owner.id),
    })

    if (!workItem) return notFound('Work item not found')
    return NextResponse.json({ workItem: serializeWorkItem(workItem) }, { status: 200 })
  } catch (error) {
    const ownerError = ownerErrorResponse(error)
    if (ownerError) return ownerError
    console.error('Error fetching work item:')
    return NextResponse.json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch work item' } }, { status: 500 })
  }
}

// PATCH /api/work-items/[id]
export async function PATCH(request: Request, { params }: RouteContext) {
  try {
    const owner = await getOwner()
    const { id } = await params
    let body: unknown
    try {
      body = await request.json()
    } catch {
      return validationError('Request body must be valid JSON')
    }

    const parsed = parseWorkItemPatch(body, owner.id)
    if ('error' in parsed) return validationError(parsed.error)

    const existing = await prisma.workItem.findFirst({
      where: { id, assigneeId: owner.id },
      select: { id: true, submittedAt: true },
    })
    if (!existing) return notFound('Work item not found')

    const { assigneeId, projectId, ...fields } = parsed.data
    delete fields.id
    const data: Prisma.WorkItemUpdateInput = { ...fields }

    if (projectId) {
      const project = await prisma.project.findUnique({ where: { id: projectId }, select: { id: true } })
      if (!project) return notFound('Project not found')
      data.project = { connect: { id: project.id } }
    }
    if (assigneeId) data.assignee = { connect: { id: assigneeId } }
    if (fields.status && shouldStampSubmittedAt(fields.status) && !existing.submittedAt) {
      data.submittedAt = currentBangkokWallClockDate()
    }

    const workItem = await prisma.workItem.update({
      where: { id },
      data,
      include: workItemInclude,
    })

    return NextResponse.json({ workItem: serializeWorkItem(workItem) }, { status: 200 })
  } catch (error) {
    const ownerError = ownerErrorResponse(error)
    if (ownerError) return ownerError
    if (hasErrorCode(error, 'P2003')) return notFound('Project not found')
    console.error('Error updating work item:')
    return NextResponse.json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to update work item' } }, { status: 500 })
  }
}

// DELETE /api/work-items/[id]
export async function DELETE(_request: Request, { params }: RouteContext) {
  try {
    const owner = await getOwner()
    const { id } = await params
    const workItem = await prisma.workItem.findFirst({
      where: { id, assigneeId: owner.id },
      select: { id: true },
    })
    if (!workItem) return notFound('Work item not found')

    const linkedWork = await prisma.timeEntry.count({ where: { workItemId: id } })
    if (linkedWork > 0) return historyConflict()

    const result = await prisma.workItem.deleteMany({ where: { id, assigneeId: owner.id } })
    if (!result.count) return notFound('Work item not found')

    return NextResponse.json({ message: 'Work item deleted successfully' }, { status: 200 })
  } catch (error) {
    const ownerError = ownerErrorResponse(error)
    if (ownerError) return ownerError
    if (hasErrorCode(error, 'P2003')) return historyConflict()
    console.error('Error deleting work item:')
    return NextResponse.json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to delete work item' } }, { status: 500 })
  }
}
