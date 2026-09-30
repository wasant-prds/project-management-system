import { randomUUID } from 'node:crypto'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getOwner, ownerErrorResponse } from '@/lib/owner'
import { validateApprovedLabelMap } from '@/lib/gitlab-issue-import'
import { serializeBangkokTimestamp } from '@/lib/bangkok-datetime'

type RouteContext = { params: Promise<{ mappingId: string }> }

function requestError(code: string, message: string, status: number, field?: string) {
  return NextResponse.json({ error: { code, message, ...(field ? { field } : {}) } }, {
    status,
    headers: { 'Cache-Control': 'no-store' },
  })
}

function safeMapping(mapping: {
  id: string
  canonicalGitLabInstanceUrl: string
  gitLabProjectId: string
  projectId: string
  approvedLabelMap: unknown
  firstSyncApprovedAt: Date | null
  createdAt: Date
  updatedAt: Date
  project: { id: string; name: string; company: { id: string; name: string; displayName: string | null } }
}) {
  return {
    id: mapping.id,
    instanceUrl: mapping.canonicalGitLabInstanceUrl,
    gitLabProjectId: mapping.gitLabProjectId,
    projectId: mapping.projectId,
    approvedLabelMap: mapping.approvedLabelMap,
    firstSyncApprovedAt: mapping.firstSyncApprovedAt ? serializeBangkokTimestamp(mapping.firstSyncApprovedAt) : null,
    createdAt: serializeBangkokTimestamp(mapping.createdAt),
    updatedAt: serializeBangkokTimestamp(mapping.updatedAt),
    project: mapping.project,
  }
}

async function parseJson(request: Request): Promise<unknown> {
  try { return await request.json() } catch { return null }
}

function sameLabelMap(current: unknown, next: Record<string, string>) {
  if (typeof current !== 'object' || current === null || Array.isArray(current)) return false
  const entries = Object.entries(next)
  const currentMap = current as Record<string, unknown>
  return Object.keys(currentMap).length === entries.length
    && entries.every(([label, type]) => currentMap[label] === type)
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    await getOwner()
    const { mappingId } = await context.params
    const raw = await parseJson(request)
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
      return requestError('VALIDATION_ERROR', 'ข้อมูล mapping ไม่ถูกต้อง', 400)
    }
    const body = raw as Record<string, unknown>
    if (Object.keys(body).some((key) => !['projectId', 'approvedLabelMap'].includes(key))) {
      return requestError('VALIDATION_ERROR', 'แก้ไขได้เฉพาะ PMS Project และ label mapping', 400)
    }
    const data: { projectId?: string; approvedLabelMap?: Record<string, string>; firstSyncApprovedAt?: Date | null } = {}
    if ('projectId' in body) {
      if (typeof body.projectId !== 'string' || body.projectId.trim() === '') {
        return requestError('VALIDATION_ERROR', 'PMS Project ไม่ถูกต้อง', 400, 'projectId')
      }
      const project = await prisma.project.findUnique({ where: { id: body.projectId }, select: { id: true } })
      if (!project) return requestError('VALIDATION_ERROR', 'ไม่พบ PMS Project ที่เลือก', 400, 'projectId')
      data.projectId = body.projectId
    }
    if ('approvedLabelMap' in body) {
      const approvedLabelMap = validateApprovedLabelMap(body.approvedLabelMap)
      if (!approvedLabelMap) return requestError('VALIDATION_ERROR', 'label mapping มีค่าที่ระบบไม่รองรับ', 400, 'approvedLabelMap')
      data.approvedLabelMap = approvedLabelMap
    }
    if (Object.keys(data).length === 0) return requestError('VALIDATION_ERROR', 'ไม่มีค่าที่แก้ไข', 400)

    const result = await prisma.$transaction(async (tx) => {
      const current = await tx.gitLabProjectMapping.findUnique({
        where: { id: mappingId },
        select: { id: true, canonicalGitLabInstanceUrl: true, gitLabProjectId: true, projectId: true, approvedLabelMap: true },
      })
      if (!current) return { conflict: 'NOT_FOUND' as const }
      const updateData = { ...data }
      const destinationChanged = updateData.projectId !== undefined && updateData.projectId !== current.projectId
      if (destinationChanged) {
        const references = await tx.externalWorkItemReference.count({
          where: { provider: 'gitlab', canonicalGitLabInstanceUrl: current.canonicalGitLabInstanceUrl, gitLabProjectId: current.gitLabProjectId },
        })
        if (references > 0) return { conflict: 'DESTINATION_HAS_REFERENCES' as const }
      }
      const labelMapChanged = updateData.approvedLabelMap !== undefined
        && !sameLabelMap(current.approvedLabelMap, updateData.approvedLabelMap)
      if (destinationChanged || labelMapChanged) updateData.firstSyncApprovedAt = null
      const mapping = await tx.gitLabProjectMapping.update({
        where: { id: mappingId },
        data: updateData,
        include: { project: { select: { id: true, name: true, company: { select: { id: true, name: true, displayName: true } } } } },
      })
      return { mapping }
    }, { isolationLevel: 'Serializable' })
    if ('conflict' in result && result.conflict === 'NOT_FOUND') {
      return requestError('NOT_FOUND', 'ไม่พบ GitLab Project mapping', 404)
    }
    if ('conflict' in result && result.conflict === 'DESTINATION_HAS_REFERENCES') {
      return requestError('CONFLICT', 'มี Work Items ที่นำเข้าแล้ว จึงย้าย Project ปลายทางไม่ได้', 409)
    }
    const mapping = result.mapping
    return NextResponse.json({ mapping: safeMapping(mapping) }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    const ownerResponse = ownerErrorResponse(error)
    if (ownerResponse) return ownerResponse
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2025') {
      return requestError('NOT_FOUND', 'ไม่พบ GitLab Project mapping', 404)
    }
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2034') {
      return requestError('CONFLICT', 'mapping เปลี่ยนพร้อมกัน กรุณาโหลดข้อมูลแล้วลองใหม่', 409)
    }
    const traceId = randomUUID()
    console.error('GitLab project mapping update failed', { traceId })
    return requestError('INTERNAL_ERROR', 'ไม่สามารถแก้ไข GitLab Project mapping ได้', 500)
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  try {
    await getOwner()
    const { mappingId } = await context.params
    const mapping = await prisma.gitLabProjectMapping.findUnique({ where: { id: mappingId }, select: { id: true } })
    if (!mapping) return requestError('NOT_FOUND', 'ไม่พบ GitLab Project mapping', 404)
    await prisma.gitLabProjectMapping.delete({ where: { id: mappingId } })
    return NextResponse.json({ deleted: true }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    const ownerResponse = ownerErrorResponse(error)
    if (ownerResponse) return ownerResponse
    const traceId = randomUUID()
    console.error('GitLab project mapping delete failed', { traceId })
    return requestError('INTERNAL_ERROR', 'ไม่สามารถลบ GitLab Project mapping ได้', 500)
  }
}
