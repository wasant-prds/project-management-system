import { NextResponse } from 'next/server'
import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db'
import { getOwner, ownerErrorResponse } from '@/lib/owner'
import { bangkokDateRange } from '@/lib/bangkok-datetime'

function apiError(status: number, code: string, message: string, field?: string) {
  return NextResponse.json({ error: { code, message, ...(field ? { field } : {}) } }, { status })
}

export async function GET(request: Request) {
  try {
    const owner = await getOwner()
    const { searchParams } = new URL(request.url)
    const startDate = searchParams.get('startDate')
    const endDate = searchParams.get('endDate')
    if ((startDate === null) !== (endDate === null)) {
      return apiError(400, 'VALIDATION_ERROR', 'startDate and endDate must be provided together', 'startDate')
    }

    const where: Prisma.TimeEntryWhereInput = { userId: owner.internalId }
    if (startDate !== null && endDate !== null) {
      const start = bangkokDateRange(startDate)
      const end = bangkokDateRange(endDate)
      if (!start || !end || end.start < start.start) {
        return apiError(400, 'VALIDATION_ERROR', 'startDate and endDate must be valid ordered dates', 'startDate')
      }
      where.date = { gte: start.start, lt: end.end }
    }

    const result = await prisma.timeEntry.aggregate({ where, _sum: { hours: true } })
    return NextResponse.json({
      summary: {
        hours: result._sum.hours?.toString() ?? '0',
        timezone: 'Asia/Bangkok',
        ...(startDate !== null && endDate !== null ? { startDate, endDate } : {}),
      },
    }, { status: 200, headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    const ownerError = ownerErrorResponse(error)
    if (ownerError) return ownerError
    console.error('Error fetching work log summary:')
    return apiError(500, 'INTERNAL_ERROR', 'Failed to fetch work log summary')
  }
}
