import { NextResponse } from 'next/server'
import { reports } from '@/lib/database/repositories/reports'
import { sql, and } from '@/lib/database/sql'
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

    let where = sql`l.user_id=${owner.internalId}`
    if (startDate !== null && endDate !== null) {
      const start = bangkokDateRange(startDate)
      const end = bangkokDateRange(endDate)
      if (!start || !end || end.start < start.start) {
        return apiError(
          400,
          'VALIDATION_ERROR',
          'startDate and endDate must be valid ordered dates',
          'startDate',
        )
      }
      where = and(where, sql`l.work_date>=${start.start} AND l.work_date<${end.end}`)
    }

    const result = await reports.hours(where)
    return NextResponse.json(
      {
        summary: {
          hours: result,
          timezone: 'Asia/Bangkok',
          ...(startDate !== null && endDate !== null ? { startDate, endDate } : {}),
        },
      },
      { status: 200, headers: { 'Cache-Control': 'no-store' } },
    )
  } catch (error) {
    const ownerError = ownerErrorResponse(error)
    if (ownerError) return ownerError
    console.error('Error fetching work log summary:')
    return apiError(500, 'INTERNAL_ERROR', 'Failed to fetch work log summary')
  }
}
