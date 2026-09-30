import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { serializeWorkLog, workLogInclude, resolveWorkItemId } from '@/lib/work-logs'
import { Prisma } from '@prisma/client'
import { getOwner, ownerErrorResponse } from '@/lib/owner'
import { bangkokDateRange, currentBangkokWallClockDate, parseBangkokDateTime } from '@/lib/bangkok-datetime'
import { lockOwnedWorkItemForUpdate } from '@/lib/work-item-lock'
import { errorMessage } from '@/lib/error-message'

export async function GET(request: Request) {
  try {
    const owner = await getOwner()
    const { searchParams } = new URL(request.url)
    const date = searchParams.get('date')
    const startDateParam = searchParams.get('startDate')
    const endDateParam = searchParams.get('endDate')
    const userId = searchParams.get('userId')

    if (userId && userId !== owner.id) {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: 'userId ต้องเป็นเจ้าของระบบ' } },
        { status: 400 },
      )
    }
    const where: Prisma.TimeEntryWhereInput = { userId: owner.id }

    if (date) {
      const range = bangkokDateRange(date)
      if (!range) return NextResponse.json({ error: 'date must use a valid YYYY-MM-DD value' }, { status: 400 })
      where.date = { gte: range.start, lt: range.end }
    } else if (Boolean(startDateParam) !== Boolean(endDateParam)) {
      return NextResponse.json({ error: 'startDate and endDate must be provided together' }, { status: 400 })
    } else if (startDateParam && endDateParam) {
      const start = bangkokDateRange(startDateParam)
      const end = bangkokDateRange(endDateParam)
      if (!start || !end || end.start < start.start) {
        return NextResponse.json({ error: 'startDate and endDate must be valid ordered dates' }, { status: 400 })
      }
      where.date = { gte: start.start, lt: end.end }
    }


    const workLogs = await prisma.timeEntry.findMany({
      where,
      include: workLogInclude,
      orderBy: { date: 'desc' },
    })

    return NextResponse.json(
      { workLogs: workLogs.map((workLog) => serializeWorkLog(workLog, owner.id)) },
      { status: 200 },
    )
  } catch (error) {
    const ownerError = ownerErrorResponse(error)
    if (ownerError) return ownerError
    console.error('Error fetching work logs:')
    return NextResponse.json({ error: 'Failed to fetch work logs' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const owner = await getOwner()
    const body = await request.json()
    const { description, remarks, hours, date, userId, projectId, workItemId, status } = body
    if (userId !== undefined && userId !== owner.id) {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: 'userId ต้องเป็นเจ้าของระบบ' } },
        { status: 400 },
      )
    }

    if (!hours || !projectId || !workItemId) {
      return NextResponse.json(
        { error: 'Hours, project, and work item are required' },
        { status: 400 },
      )
    }
    const workLogDate = date === undefined ? currentBangkokWallClockDate() : parseBangkokDateTime(date)
    if (!workLogDate || Number.isNaN(workLogDate.getTime())) {
      return NextResponse.json({ error: { code: 'VALIDATION_ERROR', message: 'date must be a date-only value or an ISO timestamp with +07:00' } }, { status: 400 })
    }
    const workLog = await prisma.$transaction(async (transaction) => {
      await lockOwnedWorkItemForUpdate(transaction, workItemId, owner.id)
      const resolvedWorkItemId = await resolveWorkItemId(projectId, workItemId, owner.id, transaction)
      return transaction.timeEntry.create({
        data: {
          description,
          remarks,
          hours: Number.parseFloat(hours),
          date: workLogDate,
          userId: owner.id,
          projectId,
          workItemId: resolvedWorkItemId ?? null,
          status,
        },
        include: workLogInclude,
      })
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable })

    return NextResponse.json({ workLog: serializeWorkLog(workLog, owner.id) }, { status: 201 })
  } catch (error) {
    const ownerError = ownerErrorResponse(error)
    if (ownerError) return ownerError
    const message = errorMessage(error, 'Failed to create work log')
    const status = [
      'Work item does not belong to the selected project',
      'A project is required before assigning a work item',
      'A work item is required before saving Daily Work',
    ].includes(message) ? 400 : 500
    if (status === 400) return NextResponse.json({ error: message }, { status })
    console.error('Error creating work log:')
    return NextResponse.json({ error: 'Failed to save Daily Work' }, { status })
  }
}
