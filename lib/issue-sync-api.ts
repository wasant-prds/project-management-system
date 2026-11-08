import { projects } from '@/lib/database/repositories/projects'
import { syncConfigs } from '@/lib/database/repositories/issue-sync'
import { randomUUID } from 'node:crypto'
import { NextResponse } from 'next/server'
import { database } from '@/lib/database/client'
import { getOwner, ownerErrorResponse } from '@/lib/owner'
import { parsePublicId } from '@/lib/public-id'
import { IssueSyncError } from '@/lib/issue-sync-provider'
import { currentBangkokWallClockDate } from '@/lib/bangkok-datetime'

export type ProjectSyncContext = { params: Promise<{ id: string; configId?: string }> }
export const syncJson = (body: unknown, status = 200) =>
  NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } })
export async function syncBody(request: Request): Promise<Record<string, unknown>> {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    /* validated below */
  }
  if (!body || typeof body !== 'object' || Array.isArray(body))
    throw new IssueSyncError('VALIDATION_ERROR', 'JSON body ไม่ถูกต้อง', 400)
  return body as Record<string, unknown>
}
export function onlyFields(body: Record<string, unknown>, allowed: string[]) {
  if (Object.keys(body).some((key) => !allowed.includes(key)))
    throw new IssueSyncError('VALIDATION_ERROR', 'มี field ที่ไม่รองรับ', 400)
}
export async function ownedSyncProject(context: ProjectSyncContext) {
  const owner = await getOwner()
  const params = await context.params
  const publicId = parsePublicId(params.id)
  if (!publicId) throw new IssueSyncError('VALIDATION_ERROR', 'Project ต้องเป็น public UUIDv4', 400)
  const project = await projects.byPublicId(publicId, database)
  if (!project) throw new IssueSyncError('NOT_FOUND', 'ไม่พบ PMS Project', 404)
  return { owner, project }
}
export async function ownedSyncConfig(context: ProjectSyncContext) {
  const authorized = await ownedSyncProject(context)
  const publicId = parsePublicId((await context.params).configId)
  if (!publicId) throw new IssueSyncError('VALIDATION_ERROR', 'Config ต้องเป็น public UUIDv4', 400)
  const config = await syncConfigs.byPublicId(publicId, authorized.project.id, database)
  if (!config) throw new IssueSyncError('NOT_FOUND', 'ไม่พบ config ภายใน Project นี้', 404)
  return { ...authorized, config }
}
export function assertConfigIdle(leaseUntil: Date | null) {
  if (leaseUntil && leaseUntil > currentBangkokWallClockDate())
    throw new IssueSyncError('SYNC_IN_PROGRESS', 'กำลัง sync กรุณารอให้รอบนี้เสร็จก่อนแก้ config', 409)
}
export function syncApiError(error: unknown) {
  const owner = ownerErrorResponse(error)
  if (owner) return owner
  if (error instanceof IssueSyncError)
    return syncJson({ error: { code: error.code, message: error.message } }, error.status)
  const code = typeof error === 'object' && error && 'code' in error ? error.code : null
  if (code === '23505' || code === '40001' || code === '40P01' || code === '23503')
    return syncJson(
      { error: { code: 'CONFLICT', message: 'ข้อมูลซ้ำหรือเปลี่ยนพร้อมกัน กรุณาโหลดใหม่แล้วลองอีกครั้ง' } },
      409,
    )
  console.error('Issue sync request failed', { traceId: randomUUID() })
  return syncJson({ error: { code: 'INTERNAL_ERROR', message: 'ดำเนินการ issue sync ไม่สำเร็จ' } }, 500)
}
