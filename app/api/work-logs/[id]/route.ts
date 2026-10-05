import { NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db'
import { getOwner, ownerErrorResponse } from '@/lib/owner'
import { parsePatchWorkLogInput, parseWorkLogRequestBody } from '@/lib/work-log-input'
import { lockOwnedWorkItemForUpdate } from '@/lib/work-item-lock'
import { resolveOwnedWorkItem, serializeWorkLog, workLogInclude } from '@/lib/work-logs'
import { parsePublicId } from '@/lib/public-id'

type RouteContext = { params: Promise<{ id: string }> }

function apiError(status: number, code: string, message: string, field?: string) {
  return NextResponse.json({ error: { code, message, ...(field ? { field } : {}) } }, { status })
}

function validationError(message: string, field?: string) {
  return apiError(400, 'VALIDATION_ERROR', message, field)
}

export async function GET(_request: Request, { params }: RouteContext) {
  try {
    const owner = await getOwner()
    const publicId = parsePublicId((await params).id)
    if (!publicId) return validationError('ต้องเป็น public UUID', 'id')
    const workLog = await prisma.timeEntry.findFirst({
      where: { publicId, userId: owner.internalId },
      include: workLogInclude,
    })

    if (!workLog) return apiError(404, 'NOT_FOUND', 'Work log not found')
    return NextResponse.json(
      { workLog: serializeWorkLog(workLog, owner.internalId) },
      { status: 200, headers: { 'Cache-Control': 'no-store' } },
    )
  } catch (error) {
    const ownerError = ownerErrorResponse(error)
    if (ownerError) return ownerError
    console.error('Error fetching work log:')
    return apiError(500, 'INTERNAL_ERROR', 'Failed to fetch work log')
  }
}

export async function PATCH(request: Request, { params }: RouteContext) {
  try {
    const owner = await getOwner()
    const publicId = parsePublicId((await params).id)
    if (!publicId) return validationError('ต้องเป็น public UUID', 'id')
    const body = await parseWorkLogRequestBody(request)
    if (!body.ok) return validationError(body.error.message, body.error.field)

    const input = parsePatchWorkLogInput(body.value, owner.id)
    if (!input.ok) return validationError(input.error.message, input.error.field)

    const outcome = await prisma.$transaction(async (transaction) => {
      const existing = await transaction.timeEntry.findFirst({
        where: { publicId, userId: owner.internalId },
        select: { id: true, workItemId: true },
      })
      if (!existing) return { kind: 'work-log-missing' as const }

      const workItem = input.value.workItemId
        ? await resolveOwnedWorkItem(input.value.workItemId, owner.internalId, transaction)
        : existing.workItemId
          ? await transaction.workItem.findFirst({
            where: { id: existing.workItemId, assigneeId: owner.internalId },
            select: { id: true, publicId: true, projectId: true, project: { select: { publicId: true } } },
          })
          : null
      if (!workItem) return { kind: input.value.workItemId ? 'work-item-missing' as const : 'work-item-required' as const }
      await lockOwnedWorkItemForUpdate(transaction, workItem.id, owner.internalId)
      if (input.value.projectId !== undefined && input.value.projectId !== workItem.project.publicId) {
        return { kind: 'project-mismatch' as const }
      }

      const data: Prisma.TimeEntryUncheckedUpdateInput = {
        projectId: workItem.projectId,
        workItemId: workItem.id,
        ...(input.value.description !== undefined ? { description: input.value.description } : {}),
        ...(input.value.remarks !== undefined ? { remarks: input.value.remarks } : {}),
        ...(input.value.hours !== undefined ? { hours: input.value.hours } : {}),
        ...(input.value.date !== undefined ? { date: input.value.date } : {}),
        ...(input.value.status !== undefined ? { status: input.value.status } : {}),
      }
      const workLog = await transaction.timeEntry.update({
        where: { id: existing.id },
        data,
        include: workLogInclude,
      })
      return { kind: 'updated' as const, workLog }
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable })

    if (outcome.kind === 'work-log-missing') return apiError(404, 'NOT_FOUND', 'Work log not found')
    if (outcome.kind === 'work-item-required') return validationError('workItemId is required', 'workItemId')
    if (outcome.kind === 'work-item-missing') return apiError(404, 'NOT_FOUND', 'Work Item not found', 'workItemId')
    if (outcome.kind === 'project-mismatch') return apiError(400, 'RELATION_MISMATCH', 'Project must match the Work Item Project', 'projectId')
    if (outcome.kind !== 'updated') return apiError(500, 'INTERNAL_ERROR', 'Failed to save Daily Work')

    return NextResponse.json({ workLog: serializeWorkLog(outcome.workLog, owner.internalId) }, { status: 200 })
  } catch (error) {
    const ownerError = ownerErrorResponse(error)
    if (ownerError) return ownerError
    console.error('Error updating work log:')
    return apiError(500, 'INTERNAL_ERROR', 'Failed to save Daily Work')
  }
}

export async function DELETE(_request: Request, { params }: RouteContext) {
  try {
    const owner = await getOwner()
    const publicId = parsePublicId((await params).id)
    if (!publicId) return validationError('ต้องเป็น public UUID', 'id')
    const result = await prisma.timeEntry.deleteMany({ where: { publicId, userId: owner.internalId } })
    if (!result.count) return apiError(404, 'NOT_FOUND', 'Work log not found')
    return NextResponse.json({ message: 'Work log deleted successfully' }, { status: 200 })
  } catch (error) {
    const ownerError = ownerErrorResponse(error)
    if (ownerError) return ownerError
    console.error('Error deleting work log:')
    return apiError(500, 'INTERNAL_ERROR', 'Failed to delete work log')
  }
}
