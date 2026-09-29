import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { serializeWorkLog, workLogInclude, resolveWorkItemId } from '@/lib/work-logs'
import type { Prisma } from '@prisma/client'
import { getOwner, ownerErrorResponse } from '@/lib/owner'

function dateRangeFromParam(date: string) {
  const [year, month, day] = date.split('-').map(Number)
  return {
    start: new Date(year, month - 1, day, 0, 0, 0, 0),
    end: new Date(year, month - 1, day, 23, 59, 59, 999),
  }
}

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
      const range = dateRangeFromParam(date)
      where.date = { gte: range.start, lte: range.end }
    } else if (startDateParam && endDateParam) {
      const start = dateRangeFromParam(startDateParam).start
      const end = dateRangeFromParam(endDateParam).end
      where.date = { gte: start, lte: end }
    }


    const workLogs = await prisma.timeEntry.findMany({
      where,
      include: workLogInclude,
      orderBy: { date: 'desc' },
    })

    return NextResponse.json(
      { workLogs: workLogs.map(serializeWorkLog) },
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
    const resolvedWorkItemId = await resolveWorkItemId(projectId, workItemId)

    const workLog = await prisma.timeEntry.create({
      data: {
        description,
        remarks,
        hours: Number.parseFloat(hours),
        date: date ? new Date(date) : new Date(),
        userId: owner.id,
        projectId,
        workItemId: resolvedWorkItemId ?? null,
        status,
      },
      include: workLogInclude,
    })

    return NextResponse.json({ workLog: serializeWorkLog(workLog) }, { status: 201 })
  } catch (error) {
    const ownerError = ownerErrorResponse(error)
    if (ownerError) return ownerError
    const message = error instanceof Error ? error.message : 'Failed to create work log'
    console.error('Error creating work log:')
    const status = ['Work item does not belong to the selected project', 'A project is required before assigning a work item'].includes(message) ? 400 : 500
    return NextResponse.json({ error: status === 400 ? message : 'Failed to save Daily Work' }, { status })
  }
}
