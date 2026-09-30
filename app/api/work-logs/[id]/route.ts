import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { serializeWorkLog, workLogInclude, resolveWorkItemId } from '@/lib/work-logs'
import { getOwner, ownerErrorResponse } from '@/lib/owner'
import { parseBangkokDateTime } from '@/lib/bangkok-datetime'
import { Prisma } from '@prisma/client'
import { lockOwnedWorkItemForUpdate } from '@/lib/work-item-lock'
import { errorMessage } from '@/lib/error-message'

function parseHours(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (typeof value !== 'string' || value.trim() === '') return null

  const hours = Number(value)
  return Number.isFinite(hours) ? hours : null
}

function parseDate(value: unknown): Date | null {
  return parseBangkokDateTime(value)
}

async function workLogUpdateData(
  body: Record<string, unknown>,
  currentProjectId: string | null,
  currentWorkItemId: string | null,
  ownerId: string,
  database: Parameters<typeof resolveWorkItemId>[3] = prisma,
) {
  const { description, remarks, hours, date, projectId, workItemId, status } = body
  const updateData: Record<string, unknown> = {}
  if (description !== undefined) updateData.description = description
  if (remarks !== undefined) updateData.remarks = remarks
  if (hours !== undefined) {
    const parsedHours = parseHours(hours)
    if (parsedHours === null) return { error: 'hours must be a finite number' }
    updateData.hours = parsedHours
  }
  if (date !== undefined) {
    const parsedDate = parseDate(date)
    if (parsedDate === null) return { error: 'date must be a valid date string' }
    updateData.date = parsedDate
  }
  if (projectId !== undefined) updateData.projectId = projectId
  if (status !== undefined) updateData.status = status
  if (workItemId !== undefined || projectId !== undefined) {
    const nextProjectId = projectId === undefined ? currentProjectId : projectId as string | null
    const nextWorkItemId = workItemId === undefined ? currentWorkItemId : workItemId
    updateData.workItemId = await resolveWorkItemId(nextProjectId, nextWorkItemId, ownerId, database)
  }
  return { data: updateData }
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const owner = await getOwner()
    const { id } = await params
    const workLog = await prisma.timeEntry.findFirst({
      where: { id, userId: owner.id },
      include: workLogInclude,
    })

    if (!workLog) {
      return NextResponse.json({ error: 'Work log not found' }, { status: 404 })
    }

    return NextResponse.json({ workLog: serializeWorkLog(workLog, owner.id) }, { status: 200 })
  } catch (error) {
    const ownerError = ownerErrorResponse(error)
    if (ownerError) return ownerError
    console.error('Error fetching work log:')
    return NextResponse.json({ error: 'Failed to fetch work log' }, { status: 500 })
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const owner = await getOwner()
    const { id } = await params
    const body = await request.json()
    if (body.userId !== undefined && body.userId !== owner.id) {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: 'userId ต้องเป็นเจ้าของระบบ' } },
        { status: 400 },
      )
    }
    const outcome = await prisma.$transaction(async (transaction) => {
      const existing = await transaction.timeEntry.findFirst({
        where: { id, userId: owner.id },
        select: { projectId: true, workItemId: true },
      })
      if (!existing) return { kind: 'missing' as const }

      const targetWorkItemId = body.workItemId === undefined ? existing.workItemId : body.workItemId
      if ((body.projectId !== undefined || body.workItemId !== undefined) && typeof targetWorkItemId === 'string') {
        await lockOwnedWorkItemForUpdate(transaction, targetWorkItemId, owner.id)
      }
      const update = await workLogUpdateData(body, existing.projectId, existing.workItemId, owner.id, transaction)
      if ('error' in update) return { kind: 'invalid' as const, message: update.error }

      const workLog = await transaction.timeEntry.update({
        where: { id },
        data: update.data,
        include: workLogInclude,
      })
      return { kind: 'updated' as const, workLog }
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable })

    if (outcome.kind === 'missing') return NextResponse.json({ error: 'Work log not found' }, { status: 404 })
    if (outcome.kind === 'invalid') {
      return NextResponse.json({ error: { code: 'VALIDATION_ERROR', message: outcome.message } }, { status: 400 })
    }

    return NextResponse.json({ workLog: serializeWorkLog(outcome.workLog, owner.id) }, { status: 200 })
  } catch (error) {
    const ownerError = ownerErrorResponse(error)
    if (ownerError) return ownerError
    const message = errorMessage(error, 'Failed to update work log')
    const status = [
      'Work item does not belong to the selected project',
      'A project is required before assigning a work item',
      'A work item is required before saving Daily Work',
    ].includes(message) ? 400 : 500
    if (status === 400) return NextResponse.json({ error: message }, { status })
    console.error('Error updating work log:')
    return NextResponse.json({ error: 'Failed to save Daily Work' }, { status })
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const owner = await getOwner()
    const { id } = await params
    const result = await prisma.timeEntry.deleteMany({ where: { id, userId: owner.id } })
    if (!result.count) {
      return NextResponse.json({ error: 'Work log not found' }, { status: 404 })
    }
    return NextResponse.json({ message: 'Work log deleted successfully' }, { status: 200 })
  } catch (error) {
    const ownerError = ownerErrorResponse(error)
    if (ownerError) return ownerError
    console.error('Error deleting work log:')
    return NextResponse.json({ error: 'Failed to delete work log' }, { status: 500 })
  }
}
