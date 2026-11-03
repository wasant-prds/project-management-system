import { prisma } from '@/lib/db'
import { IssueSyncError } from '@/lib/issue-sync-provider'
import { syncRunDto } from '@/lib/issue-sync'
import { ownedSyncConfig, syncJson, syncApiError, type ProjectSyncContext } from '@/lib/issue-sync-api'
import { parsePublicId } from '@/lib/public-id'

export async function GET(request: Request, context: ProjectSyncContext) {
  try {
    const { config } = await ownedSyncConfig(context)
    const params = new URL(request.url).searchParams
    const limit = params.has('limit') ? Number(params.get('limit')) : 10
    if (!Number.isInteger(limit) || limit < 1 || limit > 50) throw new IssueSyncError('VALIDATION_ERROR', 'limit ต้องเป็น 1–50', 400)
    const before = params.get('before')
    let beforeId: bigint | undefined
    if (before) {
      const publicId = parsePublicId(before)
      if (!publicId) throw new IssueSyncError('VALIDATION_ERROR', 'before ต้องเป็น public UUIDv4', 400)
      const previous = await prisma.issueSyncRun.findFirst({ where: { publicId, configId: config.id }, select: { id: true } })
      if (!previous) throw new IssueSyncError('NOT_FOUND', 'ไม่พบรอบ sync ใน config นี้', 404)
      beforeId = previous.id
    }
    const rows = await prisma.issueSyncRun.findMany({ where: { configId: config.id, ...(beforeId ? { id: { lt: beforeId } } : {}) }, orderBy: { id: 'desc' }, take: limit + 1 })
    const runs = rows.slice(0, limit)
    return syncJson({ runs: runs.map(syncRunDto), nextBefore: rows.length > limit ? runs.at(-1)!.publicId : null })
  } catch (error) { return syncApiError(error) }
}
