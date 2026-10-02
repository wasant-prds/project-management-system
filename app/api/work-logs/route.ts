import { NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db'
import { getOwner, ownerErrorResponse } from '@/lib/owner'
import { bangkokDateRange, currentBangkokWallClockDate } from '@/lib/bangkok-datetime'
import { parseCreateWorkLogInput, parseWorkLogRequestBody } from '@/lib/work-log-input'
import { lockOwnedWorkItemForUpdate } from '@/lib/work-item-lock'
import { resolveOwnedWorkItem, serializeWorkLog, workLogInclude } from '@/lib/work-logs'

function apiError(status: number, code: string, message: string, field?: string) {
  return NextResponse.json({ error: { code, message, ...(field ? { field } : {}) } }, { status })
}

function validationError(message: string, field?: string) {
  return apiError(400, 'VALIDATION_ERROR', message, field)
}

export async function GET(request: Request) {
  try {
    const owner = await getOwner()
    const { searchParams } = new URL(request.url)
    const date = searchParams.get('date')
    const startDate = searchParams.get('startDate')
    const endDate = searchParams.get('endDate')
    const userId = searchParams.get('userId')

    if (userId && userId !== owner.id) return validationError('userId ต้องเป็นเจ้าของระบบ', 'userId')
    if (date !== null && (startDate !== null || endDate !== null)) {
      return validationError('Use either date or a date range, not both', 'date')
    }

    const where: Prisma.TimeEntryWhereInput = { userId: owner.id }
    if (date !== null) {
      const range = bangkokDateRange(date)
      if (!range) return validationError('date must use a valid YYYY-MM-DD value', 'date')
      where.date = { gte: range.start, lt: range.end }
    } else if ((startDate === null) !== (endDate === null)) {
      return validationError('startDate and endDate must be provided together', 'startDate')
    } else if (startDate !== null && endDate !== null) {
      const start = bangkokDateRange(startDate)
      const end = bangkokDateRange(endDate)
      if (!start || !end || end.start < start.start) {
        return validationError('startDate and endDate must be valid ordered dates', 'startDate')
      }
      where.date = { gte: start.start, lt: end.end }
    }

    const workLogs = await prisma.timeEntry.findMany({
      where,
      include: workLogInclude,
      orderBy: [{ date: 'desc' }, { id: 'desc' }],
    })

    return NextResponse.json(
      { workLogs: workLogs.map((workLog) => serializeWorkLog(workLog, owner.id)) },
      { status: 200, headers: { 'Cache-Control': 'no-store' } },
    )
  } catch (error) {
    const ownerError = ownerErrorResponse(error)
    if (ownerError) return ownerError
    console.error('Error fetching work logs:')
    return apiError(500, 'INTERNAL_ERROR', 'Failed to fetch work logs')
  }
}

export async function POST(request: Request) {
  try {
    const owner = await getOwner()
    const body = await parseWorkLogRequestBody(request)
    if (!body.ok) return validationError(body.error.message, body.error.field)

    const input = parseCreateWorkLogInput(body.value, owner.id)
    if (!input.ok) return validationError(input.error.message, input.error.field)

    const outcome = await prisma.$transaction(async (transaction) => {
      await lockOwnedWorkItemForUpdate(transaction, input.value.workItemId, owner.id)
      const workItem = await resolveOwnedWorkItem(input.value.workItemId, owner.id, transaction)
      if (!workItem) return { kind: 'work-item-missing' as const }
      if (input.value.projectId !== undefined && input.value.projectId !== workItem.projectId) {
        return { kind: 'project-mismatch' as const }
      }

      const timestamp = currentBangkokWallClockDate()
      const data: Prisma.TimeEntryUncheckedCreateInput = {
        hours: input.value.hours,
        date: input.value.date,
        createdAt: timestamp,
        updatedAt: timestamp,
        userId: owner.id,
        projectId: workItem.projectId,
        workItemId: workItem.id,
        ...(input.value.description !== undefined ? { description: input.value.description } : {}),
        ...(input.value.remarks !== undefined ? { remarks: input.value.remarks } : {}),
        ...(input.value.status !== undefined ? { status: input.value.status } : {}),
      }
      const workLog = await transaction.timeEntry.create({ data, include: workLogInclude })
      return { kind: 'created' as const, workLog }
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable })

    if (outcome.kind === 'work-item-missing') return apiError(404, 'NOT_FOUND', 'Work Item not found', 'workItemId')
    if (outcome.kind === 'project-mismatch') return apiError(400, 'RELATION_MISMATCH', 'Project must match the Work Item Project', 'projectId')
    return NextResponse.json({ workLog: serializeWorkLog(outcome.workLog, owner.id) }, { status: 201 })
  } catch (error) {
    const ownerError = ownerErrorResponse(error)
    if (ownerError) return ownerError
    console.error('Error creating work log:')
    return apiError(500, 'INTERNAL_ERROR', 'Failed to save Daily Work')
  }
}
