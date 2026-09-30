import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { shouldStampSubmittedAt } from '@/lib/work-items'
import { parseWorkItemPatch } from '@/lib/work-item-input'
import { currentBangkokWallClockDate } from '@/lib/bangkok-datetime'
import { serializeWorkItem, workItemDetailInclude, workItemInclude } from '@/lib/work-item-response'
import { Prisma } from '@prisma/client'
import { getOwner, ownerErrorResponse } from '@/lib/owner'
import { lockOwnedWorkItemForUpdate } from '@/lib/work-item-lock'

type RouteContext = { params: Promise<{ id: string }> }
type WorkItemPatchData = Extract<ReturnType<typeof parseWorkItemPatch>, { data: unknown }>['data']
type WorkItemUpdateOutcome =
  | { kind: 'missing' }
  | { kind: 'history-conflict' }
  | { kind: 'external-project-conflict' }
  | { kind: 'project-missing' }
  | { kind: 'updated'; workItem: Awaited<ReturnType<typeof prisma.workItem.update>> }

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

function importedWorkItemConflict() {
  return NextResponse.json({
    error: {
      code: 'HISTORY_CONFLICT',
      message: 'Work Item is linked to an imported GitLab Issue. Keep it to preserve the external identity.',
    },
  }, { status: 409 })
}

function projectHistoryConflict() {
  return NextResponse.json({
    error: {
      code: 'RELATION_MISMATCH',
      message: 'Cannot move a Work Item that has linked Daily Work; its Project must stay consistent with the history.',
      field: 'projectId',
    },
  }, { status: 409 })
}

function externalProjectConflict() {
  return NextResponse.json({
    error: {
      code: 'HISTORY_CONFLICT',
      message: 'Work Item is linked to a GitLab Issue and must stay in its mapped Project.',
      field: 'projectId',
    },
  }, { status: 409 })
}

function hasErrorCode(error: unknown, code: string) {
  return typeof error === 'object'
    && error !== null
    && 'code' in error
    && error.code === code
}

async function updateOwnedWorkItem(id: string, ownerId: string, changes: WorkItemPatchData): Promise<WorkItemUpdateOutcome> {
  const { assigneeId, projectId, ...fields } = changes
  delete fields.id

  return prisma.$transaction(async (transaction) => {
    await lockOwnedWorkItemForUpdate(transaction, id, ownerId)
    const existing = await transaction.workItem.findFirst({
      where: { id, assigneeId: ownerId },
      select: { id: true, projectId: true, submittedAt: true, externalReference: { select: { provider: true } } },
    })
    if (!existing) return { kind: 'missing' }

    const data: Prisma.WorkItemUpdateInput = { ...fields }
    if (projectId && projectId !== existing.projectId) {
      if (existing.externalReference?.provider === 'gitlab') return { kind: 'external-project-conflict' }
      const project = await transaction.project.findUnique({ where: { id: projectId }, select: { id: true } })
      if (!project) return { kind: 'project-missing' }

      const linkedWork = await transaction.timeEntry.count({ where: { workItemId: id } })
      if (linkedWork > 0) return { kind: 'history-conflict' }
      data.project = { connect: { id: project.id } }
    }
    if (assigneeId) data.assignee = { connect: { id: assigneeId } }
    if (fields.status && shouldStampSubmittedAt(fields.status) && !existing.submittedAt) {
      data.submittedAt = currentBangkokWallClockDate()
    }

    const workItem = await transaction.workItem.update({
      where: { id },
      data,
      include: workItemInclude,
    })
    return { kind: 'updated', workItem }
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable })
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

    const outcome = await updateOwnedWorkItem(id, owner.id, parsed.data)

    if (outcome.kind === 'missing') return notFound('Work item not found')
    if (outcome.kind === 'history-conflict') return projectHistoryConflict()
    if (outcome.kind === 'external-project-conflict') return externalProjectConflict()
    if (outcome.kind === 'project-missing') return notFound('Project not found')

    return NextResponse.json({ workItem: serializeWorkItem(outcome.workItem) }, { status: 200 })
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
      select: { id: true, externalReference: { select: { provider: true } } },
    })
    if (!workItem) return notFound('Work item not found')
    if (workItem.externalReference?.provider === 'gitlab') return importedWorkItemConflict()

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
