import { randomUUID } from 'node:crypto'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getOwner, ownerErrorResponse } from '@/lib/owner'
import { getGitLabConfiguration, validateApprovedLabelMap } from '@/lib/gitlab-issue-import'
import { serializeBangkokTimestamp } from '@/lib/bangkok-datetime'
import { parsePublicId } from '@/lib/public-id'

function requestError(code: string, message: string, status: number, field?: string) {
  return NextResponse.json({ error: { code, message, ...(field ? { field } : {}) } }, {
    status,
    headers: { 'Cache-Control': 'no-store' },
  })
}

const projectSelect = {
  publicId: true,
  name: true,
  company: { select: { publicId: true, name: true, displayName: true } },
} as const

function safeMapping(mapping: {
  publicId: string
  canonicalGitLabInstanceUrl: string
  gitLabProjectId: string
  approvedLabelMap: unknown
  firstSyncApprovedAt: Date | null
  createdAt: Date
  updatedAt: Date
  project: { publicId: string; name: string; company: { publicId: string; name: string; displayName: string | null } }
}) {
  return {
    id: mapping.publicId,
    instanceUrl: mapping.canonicalGitLabInstanceUrl,
    gitLabProjectId: mapping.gitLabProjectId,
    projectId: mapping.project.publicId,
    approvedLabelMap: mapping.approvedLabelMap,
    firstSyncApprovedAt: mapping.firstSyncApprovedAt ? serializeBangkokTimestamp(mapping.firstSyncApprovedAt) : null,
    createdAt: serializeBangkokTimestamp(mapping.createdAt),
    updatedAt: serializeBangkokTimestamp(mapping.updatedAt),
    project: {
      id: mapping.project.publicId,
      name: mapping.project.name,
      company: {
        id: mapping.project.company.publicId,
        name: mapping.project.company.name,
        displayName: mapping.project.company.displayName,
      },
    },
  }
}

async function parseJson(request: Request): Promise<unknown> {
  try { return await request.json() } catch { return null }
}

function parseMappingBody(value: unknown) {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null
  const body = value as Record<string, unknown>
  if (Object.keys(body).some((key) => !['gitLabProjectId', 'projectId', 'approvedLabelMap'].includes(key))) return null
  if (typeof body.gitLabProjectId !== 'string' || !/^[1-9]\d*$/.test(body.gitLabProjectId)) return null
  if (typeof body.projectId !== 'string' || !parsePublicId(body.projectId)) return null
  const approvedLabelMap = validateApprovedLabelMap(body.approvedLabelMap)
  if (!approvedLabelMap) return null
  return { gitLabProjectId: body.gitLabProjectId, projectId: body.projectId, approvedLabelMap }
}

export async function GET() {
  try {
    await getOwner()
    const mappings = await prisma.gitLabProjectMapping.findMany({
      where: { provider: 'gitlab' },
      include: { project: { select: projectSelect } },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    })
    return NextResponse.json({ mappings: mappings.map(safeMapping) }, {
      headers: { 'Cache-Control': 'no-store' },
    })
  } catch (error) {
    const ownerResponse = ownerErrorResponse(error)
    if (ownerResponse) return ownerResponse
    const traceId = randomUUID()
    console.error('GitLab project mapping read failed', { traceId })
    return requestError('INTERNAL_ERROR', 'ไม่สามารถอ่าน GitLab Project mappings ได้', 500)
  }
}

export async function POST(request: Request) {
  try {
    await getOwner()
    const config = getGitLabConfiguration()
    if (!config) return requestError('DEPENDENCY_UNAVAILABLE', 'ยังไม่ได้ตั้งค่า GitLab ฝั่ง server', 503)
    const body = parseMappingBody(await parseJson(request))
    if (!body) return requestError('VALIDATION_ERROR', 'กรุณาระบุ GitLab Project ID, PMS Project และ label mapping ที่รองรับ', 400)

    const project = await prisma.project.findUnique({ where: { publicId: body.projectId }, select: { id: true } })
    if (!project) return requestError('VALIDATION_ERROR', 'ไม่พบ PMS Project ที่เลือก', 400, 'projectId')
    const conflictingReference = await prisma.externalWorkItemReference.findFirst({
      where: {
        provider: 'gitlab',
        canonicalGitLabInstanceUrl: config.baseUrl,
        gitLabProjectId: body.gitLabProjectId,
        projectId: { not: project.id },
      },
      select: { id: true },
    })
    if (conflictingReference) return requestError('CONFLICT', 'GitLab Project นี้มี Work Items ที่เชื่อมกับ PMS Project อื่นอยู่แล้ว', 409)
    const mapping = await prisma.gitLabProjectMapping.create({
      data: {
        provider: 'gitlab',
        canonicalGitLabInstanceUrl: config.baseUrl,
        gitLabProjectId: body.gitLabProjectId,
        projectId: project.id,
        approvedLabelMap: body.approvedLabelMap,
      },
      include: { project: { select: projectSelect } },
    })
    return NextResponse.json({ mapping: safeMapping(mapping) }, { status: 201, headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    const ownerResponse = ownerErrorResponse(error)
    if (ownerResponse) return ownerResponse
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002') {
      return requestError('CONFLICT', 'GitLab Project นี้มี mapping อยู่แล้ว', 409, 'gitLabProjectId')
    }
    const traceId = randomUUID()
    console.error('GitLab project mapping create failed', { traceId })
    return requestError('INTERNAL_ERROR', 'ไม่สามารถสร้าง GitLab Project mapping ได้', 500)
  }
}
