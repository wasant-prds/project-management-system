import { NextResponse } from 'next/server'
import { getOwner, ownerErrorResponse } from '@/lib/owner'
import { DashboardQueryError } from '@/lib/dashboard'
import { getAnalysisSummary } from '@/lib/analysis'

function apiError(status: number, code: string, message: string, field?: string) {
  return NextResponse.json({ error: { code, message, ...(field ? { field } : {}) } }, {
    status,
    headers: { 'Cache-Control': 'no-store' },
  })
}

export async function GET(request: Request) {
  try {
    const owner = await getOwner()
    const summary = await getAnalysisSummary(owner.id, new URL(request.url).searchParams)
    return NextResponse.json(summary, { status: 200, headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    const ownerError = ownerErrorResponse(error)
    if (ownerError) return ownerError
    if (error instanceof DashboardQueryError) {
      return apiError(error.status, error.code, error.message, error.field)
    }
    console.error('Error fetching analysis summary:')
    return apiError(500, 'INTERNAL_ERROR', 'ไม่สามารถอ่านข้อมูล Analysis ได้')
  }
}
