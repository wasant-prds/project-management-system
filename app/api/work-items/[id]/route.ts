import { NextResponse } from 'next/server'
import { database } from '@/lib/database/client'
import { workItems, type WorkItemChanges } from '@/lib/database/repositories/work-items'
import { projects } from '@/lib/database/repositories/projects'
import { workLogs } from '@/lib/database/repositories/work-logs'
import type { WorkItemView } from '@/lib/database/types'
import { shouldStampSubmittedAt } from '@/lib/work-items'
import { parseWorkItemPatch } from '@/lib/work-item-input'
import { currentBangkokWallClockDate } from '@/lib/bangkok-datetime'
import { serializeWorkItem } from '@/lib/work-item-response'
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
  | { kind: 'updated'; workItem: WorkItemView }

function validationError(message: string, field?: string) {
  return NextResponse.json(
    {
      error: { code: 'VALIDATION_ERROR', message, ...(field ? { field } : {}) },
    },
    { status: 400 },
  )
}

function notFound(message: string) {
  return NextResponse.json({ error: { code: 'NOT_FOUND', message } }, { status: 404 })
}

function historyConflict() {
  return NextResponse.json(
    {
      error: {
        code: 'HISTORY_CONFLICT',
        message: 'Work Item has linked Daily Work. Keep the Work Item to preserve its history.',
      },
    },
    { status: 409 },
  )
}

function importedWorkItemConflict() {
  return NextResponse.json(
    {
      error: {
        code: 'HISTORY_CONFLICT',
        message: 'Work Item is linked to an imported Issue. Keep it to preserve the external identity.',
      },
    },
    { status: 409 },
  )
}

function projectHistoryConflict() {
  return NextResponse.json(
    {
      error: {
        code: 'RELATION_MISMATCH',
        message:
          'Cannot move a Work Item that has linked Daily Work; its Project must stay consistent with the history.',
        field: 'projectId',
      },
    },
    { status: 409 },
  )
}

function externalProjectConflict() {
  return NextResponse.json(
    {
      error: {
        code: 'HISTORY_CONFLICT',
        message: 'Work Item is linked to an external Issue and must stay in its mapped Project.',
        field: 'projectId',
      },
    },
    { status: 409 },
  )
}

function hasErrorCode(error: unknown, code: string) {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === code
}

async function updateOwnedWorkItem(
  publicId: string,
  owner: OwnerIdentity,
  changes: WorkItemPatchData,
): Promise<WorkItemUpdateOutcome> {
  const { assigneeId, projectId, id: _clientId, ...fields } = changes
  void _clientId

  return database.transaction(async (transaction) => {
    const existing = await workItems.byPublicId(publicId, owner.internalId, transaction)
    if (!existing) return { kind: 'missing' }
    await lockOwnedWorkItemForUpdate(transaction, existing.id, owner.internalId)

    const data: WorkItemChanges = { ...fields }
    if (projectId) {
      const projectPublicId = parsePublicId(projectId)
      if (!projectPublicId) return { kind: 'project-missing' }
      const project = await projects.byPublicId(projectPublicId, transaction)
      if (!project) return { kind: 'project-missing' }
      if (project.id !== existing.projectId) {
        if (existing.externalReference !== null) return { kind: 'external-project-conflict' }
        const linkedWork = await workLogs.countForWorkItem(existing.id, transaction)
        if (linkedWork > 0) return { kind: 'history-conflict' }
        data.projectId = project.id
      }
    }
    if (assigneeId) data.assigneeId = owner.internalId
    if (fields.status && shouldStampSubmittedAt(fields.status) && !existing.submittedAt) {
      data.submittedAt = currentBangkokWallClockDate()
    }

    const workItem = await workItems.update(existing.id, data, transaction)
    return { kind: 'updated', workItem }
  })
}

// GET /api/work-items/[id]
export async function GET(_request: Request, { params }: RouteContext) {
  try {
    const owner = await getOwner()
    const publicId = parsePublicId((await params).id)
    if (!publicId) return validationError('ต้องเป็น public UUID', 'id')
    const workItem = await workItems.byPublicId(publicId, owner.internalId)

    if (!workItem) return notFound('Work item not found')
    workItem.timeEntries = await workLogs.forWorkItem(workItem.id, owner.internalId)
    return NextResponse.json({ workItem: serializeWorkItem(workItem) }, { status: 200 })
  } catch (error) {
    const ownerError = ownerErrorResponse(error)
    if (ownerError) return ownerError
    console.error('Error fetching work item:')
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch work item' } },
      { status: 500 },
    )
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
    if (parsed.data.projectId && !parsePublicId(parsed.data.projectId))
      return validationError('ต้องเป็น public UUID', 'projectId')

    const outcome = await updateOwnedWorkItem(publicId, owner, parsed.data)

    if (outcome.kind === 'missing') return notFound('Work item not found')
    if (outcome.kind === 'history-conflict') return projectHistoryConflict()
    if (outcome.kind === 'external-project-conflict') return externalProjectConflict()
    if (outcome.kind === 'project-missing') return notFound('Project not found')

    return NextResponse.json({ workItem: serializeWorkItem(outcome.workItem) }, { status: 200 })
  } catch (error) {
    const ownerError = ownerErrorResponse(error)
    if (ownerError) return ownerError
    if (hasErrorCode(error, '23503')) return notFound('Project not found')
    console.error('Error updating work item:')
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'Failed to update work item' } },
      { status: 500 },
    )
  }
}

// DELETE /api/work-items/[id]
export async function DELETE(_request: Request, { params }: RouteContext) {
  try {
    const owner = await getOwner()
    const publicId = parsePublicId((await params).id)
    if (!publicId) return validationError('ต้องเป็น public UUID', 'id')
    const workItem = await workItems.byPublicId(publicId, owner.internalId)
    if (!workItem) return notFound('Work item not found')
    if (workItem.externalReference !== null) return importedWorkItemConflict()

    const linkedWork = await workLogs.countForWorkItem(workItem.id)
    if (linkedWork > 0) return historyConflict()

    const result = await workItems.remove(workItem.id, owner.internalId)
    if (!result) return notFound('Work item not found')

    return NextResponse.json({ message: 'Work item deleted successfully' }, { status: 200 })
  } catch (error) {
    const ownerError = ownerErrorResponse(error)
    if (ownerError) return ownerError
    if (hasErrorCode(error, '23503')) return historyConflict()
    console.error('Error deleting work item:')
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'Failed to delete work item' } },
      { status: 500 },
    )
  }
}
