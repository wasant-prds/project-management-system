import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { shouldStampSubmittedAt } from '@/lib/work-items'
import { parseWorkItemPatch } from '@/lib/work-item-input'
import { currentBangkokWallClockDate } from '@/lib/bangkok-datetime'
import { serializeWorkItem, workItemDetailInclude, workItemInclude } from '@/lib/work-item-response'
import { Prisma } from '@prisma/client'
import { getOwner, ownerErrorResponse } from '@/lib/owner'
import { lockOwnedWorkItemForUpdate } from '@/lib/work-item-lock'
import { parsePublicId } from '@/lib/public-id'
import type { OwnerIdentity } from '@/lib/owner'

type RouteContext = { params: Promise<{ id: string }> }
type WorkItemPatchData = Extract<ReturnType<typeof parseWorkItemPatch>, { data: unknown }>['data']
type WorkItemUpdateOutcome =
  | { kind: 'missing' }
  | { kind: 'history-conflict' }
  | { kind: 'external-project-conflict' }
  | { kind: 'project-missing' }
  | { kind: 'updated'; workItem: Prisma.WorkItemGetPayload<{ include: typeof workItemInclude }> }

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

async function updateOwnedWorkItem(publicId: string, owner: OwnerIdentity, changes: WorkItemPatchData): Promise<WorkItemUpdateOutcome> {
  const { assigneeId, projectId, id: _clientId, ...fields } = changes
  void _clientId

  return prisma.$transaction(async (transaction) => {
    const existing = await transaction.workItem.findFirst({
      where: { publicId, assigneeId: owner.internalId },
      select: { id: true, projectId: true, submittedAt: true, externalReference: { select: { provider: true } } },
    })
    if (!existing) return { kind: 'missing' }
    await lockOwnedWorkItemForUpdate(transaction, existing.id, owner.internalId)

    const data: Prisma.WorkItemUpdateInput = { ...fields }
    if (projectId) {
      const projectPublicId = parsePublicId(projectId)
      if (!projectPublicId) return { kind: 'project-missing' }
      const project = await transaction.project.findUnique({ where: { publicId: projectPublicId }, select: { id: true } })
      if (!project) return { kind: 'project-missing' }
      if (project.id !== existing.projectId) {
        if (existing.externalReference?.provider === 'gitlab') return { kind: 'external-project-conflict' }
        const linkedWork = await transaction.timeEntry.count({ where: { workItemId: existing.id } })
        if (linkedWork > 0) return { kind: 'history-conflict' }
        data.project = { connect: { id: project.id } }
      }
    }
    if (assigneeId) data.assignee = { connect: { id: owner.internalId } }
    if (fields.status && shouldStampSubmittedAt(fields.status) && !existing.submittedAt) {
      data.submittedAt = currentBangkokWallClockDate()
    }

    const workItem = await transaction.workItem.update({
      where: { id: existing.id },
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
    const publicId = parsePublicId((await params).id)
    if (!publicId) return validationError('ต้องเป็น public UUID', 'id')
    const workItem = await prisma.workItem.findFirst({
      where: { publicId, assigneeId: owner.internalId, project: { is: {} } },
      include: workItemDetailInclude(owner.internalId),
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
    const publicId = parsePublicId((await params).id)
    if (!publicId) return validationError('ต้องเป็น public UUID', 'id')
    let body: unknown
    try {
      body = await request.json()
    } catch {
      return validationError('Request body must be valid JSON')
    }

    const parsed = parseWorkItemPatch(body, owner.id)
    if ('error' in parsed) return validationError(parsed.error)
    if (parsed.data.projectId && !parsePublicId(parsed.data.projectId)) return validationError('ต้องเป็น public UUID', 'projectId')

    const outcome = await updateOwnedWorkItem(publicId, owner, parsed.data)

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
    const publicId = parsePublicId((await params).id)
    if (!publicId) return validationError('ต้องเป็น public UUID', 'id')
    const workItem = await prisma.workItem.findFirst({
      where: { publicId, assigneeId: owner.internalId },
      select: { id: true, externalReference: { select: { provider: true } } },
    })
    if (!workItem) return notFound('Work item not found')
    if (workItem.externalReference?.provider === 'gitlab') return importedWorkItemConflict()

    const linkedWork = await prisma.timeEntry.count({ where: { workItemId: workItem.id } })
    if (linkedWork > 0) return historyConflict()

    const result = await prisma.workItem.deleteMany({ where: { id: workItem.id, assigneeId: owner.internalId } })
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
