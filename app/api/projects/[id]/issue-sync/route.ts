import { prisma } from '@/lib/db'
import { IssueSourceClient, IssueSyncError, isTokenEnvVar, parseAssignees, requiredCredential } from '@/lib/issue-sync-provider'
import { syncConfigDto } from '@/lib/issue-sync'
import { validateApprovedLabelMap } from '@/lib/gitlab-issue-import'
import { ownedSyncProject, syncBody, onlyFields, syncJson, syncApiError, type ProjectSyncContext } from '@/lib/issue-sync-api'

export async function GET(_request: Request, context: ProjectSyncContext) {
  try {
    const { project } = await ownedSyncProject(context)
    const configs = await prisma.issueSyncConfig.findMany({ where: { mapping: { projectId: project.id } }, include: { mapping: true }, orderBy: { id: 'asc' } })
    const legacyMappings = await prisma.gitLabProjectMapping.findMany({ where: { projectId: project.id, syncConfig: null }, select: { publicId: true, provider: true, gitLabProjectId: true, canonicalGitLabInstanceUrl: true } })
    return syncJson({
      configs: configs.map(syncConfigDto),
      legacyMappings: legacyMappings.map((mapping) => ({ id: mapping.publicId, provider: mapping.provider, externalProjectId: mapping.gitLabProjectId, instanceUrl: mapping.canonicalGitLabInstanceUrl })),
    })
  } catch (error) { return syncApiError(error) }
}

export async function POST(request: Request, context: ProjectSyncContext) {
  try {
    const { project } = await ownedSyncProject(context)
    const body = await syncBody(request)
    onlyFields(body, ['provider', 'instanceUrl', 'sourceProject', 'assignees', 'tokenEnvVar', 'approvedLabelMap'])
    const assignees = parseAssignees(body.assignees)
    const approvedLabelMap = validateApprovedLabelMap(body.approvedLabelMap ?? {})
    if (!['gitlab', 'github'].includes(String(body.provider)) || typeof body.instanceUrl !== 'string'
      || typeof body.sourceProject !== 'string' || !isTokenEnvVar(body.tokenEnvVar) || !assignees || !approvedLabelMap) {
      throw new IssueSyncError('VALIDATION_ERROR', 'กรุณาระบุ provider, project, ชื่อตัวแปร token และ assignee อย่างน้อยหนึ่งคนให้ถูกต้อง', 400)
    }
    const credential = requiredCredential(body.tokenEnvVar, String(body.provider), body.instanceUrl)
    const source = await new IssueSourceClient(credential).resolveProject(body.sourceProject.trim())
    const config = await prisma.$transaction(async (tx) => {
      const scope = { provider: credential.provider, canonicalGitLabInstanceUrl: credential.baseUrl, gitLabProjectId: source.id }
      const existing = await tx.gitLabProjectMapping.findUnique({ where: { provider_canonicalGitLabInstanceUrl_gitLabProjectId: scope } })
      if (existing && existing.projectId !== project.id) throw new IssueSyncError('SOURCE_ALREADY_MAPPED', 'Source project นี้เชื่อมกับ PMS Project อื่นแล้ว', 409)
      if (await tx.externalWorkItemReference.count({ where: { ...scope, projectId: { not: project.id } } })) {
        throw new IssueSyncError('SOURCE_IDENTITY_CONFLICT', 'Source project มีประวัติใน PMS Project อื่นอยู่แล้ว', 409)
      }
      const mapping = existing
        ? await tx.gitLabProjectMapping.update({ where: { id: existing.id }, data: { approvedLabelMap, firstSyncApprovedAt: null } })
        : await tx.gitLabProjectMapping.create({ data: { ...scope, projectId: project.id, approvedLabelMap } })
      return tx.issueSyncConfig.create({ data: { mappingId: mapping.id, sourceProjectPath: source.path, tokenEnvVar: credential.tokenEnvVar, assignees }, include: { mapping: true } })
    }, { isolationLevel: 'Serializable' })
    return syncJson({ config: syncConfigDto(config) }, 201)
  } catch (error) { return syncApiError(error) }
}
