import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { serializeWorkLog, workLogInclude, resolveWorkItemId } from '@/lib/work-logs'
import type { Prisma } from '@prisma/client'

function dateRangeFromParam(date: string) {
  const [year, month, day] = date.split('-').map(Number)
  return {
    start: new Date(year, month - 1, day, 0, 0, 0, 0),
    end: new Date(year, month - 1, day, 23, 59, 59, 999),
  }
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const date = searchParams.get('date')
    const startDateParam = searchParams.get('startDate')
    const endDateParam = searchParams.get('endDate')
    const userId = searchParams.get('userId')

    const where: Prisma.TimeEntryWhereInput = {}

    if (date) {
      const range = dateRangeFromParam(date)
      where.date = { gte: range.start, lte: range.end }
    } else if (startDateParam && endDateParam) {
      const start = dateRangeFromParam(startDateParam).start
      const end = dateRangeFromParam(endDateParam).end
      where.date = { gte: start, lte: end }
    }

    if (userId) where.userId = userId

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
    console.error('Error fetching work logs:', error)
    return NextResponse.json({ error: 'Failed to fetch work logs' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { description, remarks, hours, date, userId, projectId, workItemId, status } = body

    if (!hours || !userId || !projectId || !workItemId) {
      return NextResponse.json(
        { error: 'Hours, user ID, project, and work item are required' },
        { status: 400 },
      )
    }

    const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } })
    if (!user) {
      return NextResponse.json({ error: `User not found with ID: ${userId}` }, { status: 404 })
    }

    const resolvedWorkItemId = await resolveWorkItemId(projectId, workItemId)

    const workLog = await prisma.timeEntry.create({
      data: {
        description,
        remarks,
        hours: Number.parseFloat(hours),
        date: date ? new Date(date) : new Date(),
        userId,
        projectId,
        workItemId: resolvedWorkItemId ?? null,
        status,
      },
      include: workLogInclude,
    })

    return NextResponse.json({ workLog: serializeWorkLog(workLog) }, { status: 201 })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to create work log'
    console.error('Error creating work log:', error)
    const status = message.includes('Work item') || message.includes('project is required') ? 400 : 500
    return NextResponse.json({ error: message }, { status })
  }
}
