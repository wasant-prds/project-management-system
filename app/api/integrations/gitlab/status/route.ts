import { NextResponse } from 'next/server'
import { getOwner, ownerErrorResponse } from '@/lib/owner'
import { getGitLabConfiguration } from '@/lib/gitlab-issue-import'

export async function GET() {
  try {
    await getOwner()
    return NextResponse.json({ configured: Boolean(getGitLabConfiguration()) }, {
      headers: { 'Cache-Control': 'no-store' },
    })
  } catch (error) {
    const ownerResponse = ownerErrorResponse(error)
    if (ownerResponse) return ownerResponse
    return NextResponse.json({
      error: { code: 'INTERNAL_ERROR', message: 'ไม่สามารถตรวจสอบสถานะ GitLab ได้' },
    }, { status: 500, headers: { 'Cache-Control': 'no-store' } })
  }
}
