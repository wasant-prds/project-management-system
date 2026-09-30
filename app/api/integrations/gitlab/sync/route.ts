import { randomUUID } from 'node:crypto'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getOwner, ownerErrorResponse } from '@/lib/owner'
import { GitLabProviderError, getGitLabConfiguration, syncGitLabProject } from '@/lib/gitlab-issue-import'
import { currentBangkokWallClockDate } from '@/lib/bangkok-datetime'

type SafeCode = 'VALIDATION_ERROR' | 'NOT_FOUND' | 'CONFLICT' | 'FIRST_SYNC_APPROVAL_REQUIRED'

function requestError(code: SafeCode | string, message: string, status: number, field?: string) {
  return NextResponse.json({ error: { code, message, ...(field ? { field } : {}) } }, {
    status,
    headers: { 'Cache-Control': 'no-store' },
  })
}

export async function POST(request: Request) {
  try {
    const owner = await getOwner()
    const config = getGitLabConfiguration()
    if (!config) return requestError('DEPENDENCY_UNAVAILABLE', 'ยังไม่ได้ตั้งค่า GitLab ฝั่ง server', 503)
    let raw: unknown
    try { raw = await request.json() } catch { raw = null }
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
      return requestError('VALIDATION_ERROR', 'ข้อมูล sync ไม่ถูกต้อง', 400)
    }
    const body = raw as Record<string, unknown>
    if (typeof body.mappingId !== 'string' || body.mappingId.trim() === ''
      || (body.approveFirstSync !== undefined && typeof body.approveFirstSync !== 'boolean')
      || Object.keys(body).some((key) => !['mappingId', 'approveFirstSync'].includes(key))) {
      return requestError('VALIDATION_ERROR', 'กรุณาระบุ mapping ที่ต้องการ sync', 400, 'mappingId')
    }
    const mapping = await prisma.gitLabProjectMapping.findUnique({ where: { id: body.mappingId } })
    if (!mapping) return requestError('NOT_FOUND', 'ไม่พบ GitLab Project mapping', 404)
    if (mapping.canonicalGitLabInstanceUrl !== config.baseUrl) {
      return requestError('CONFLICT', 'mapping นี้อยู่บน GitLab instance อื่น กรุณาตรวจ server configuration', 409)
    }
    let mappingToSync = mapping
    if (!mapping.firstSyncApprovedAt) {
      if (body.approveFirstSync !== true) {
        return requestError('FIRST_SYNC_APPROVAL_REQUIRED', 'ต้องยืนยันการนำเข้า Issue ครั้งแรกก่อนเริ่ม sync', 409)
      }
      mappingToSync = await prisma.gitLabProjectMapping.update({
        where: { id: mapping.id },
        data: { firstSyncApprovedAt: currentBangkokWallClockDate() },
      })
    }

    const result = await syncGitLabProject({ prisma, mapping: mappingToSync, ownerId: owner.id, config })
    if (result.results.length === 0 && result.runError) {
      return requestError(result.runError.code, result.runError.message, 503)
    }
    return NextResponse.json({ mappingId: mapping.id, ...result }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    const ownerResponse = ownerErrorResponse(error)
    if (ownerResponse) return ownerResponse
    if (error instanceof GitLabProviderError) {
      return requestError(error.code, error.message, 503)
    }
    const traceId = randomUUID()
    console.error('GitLab Issue sync failed', { traceId })
    return requestError('INTERNAL_ERROR', 'ไม่สามารถ sync GitLab Issues ได้', 500)
  }
}
