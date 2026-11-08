import { syncConfigs, mappings, sourceReferences } from '@/lib/database/repositories/issue-sync'
import { database } from '@/lib/database/client'
import {
  IssueSourceClient,
  IssueSyncError,
  isTokenEnvVar,
  parseAssignees,
  requiredCredential,
} from '@/lib/issue-sync-provider'
import { syncConfigDto } from '@/lib/issue-sync'
import { validateApprovedLabelMap } from '@/lib/integrations/source-validation'
import {
  ownedSyncProject,
  syncBody,
  onlyFields,
  syncJson,
  syncApiError,
  type ProjectSyncContext,
} from '@/lib/issue-sync-api'

export async function GET(_request: Request, context: ProjectSyncContext) {
  try {
    const { project } = await ownedSyncProject(context)
    const configs = await syncConfigs.list(project.id, database)
    const legacyMappings = await mappings.legacy(project.id, database)
    return syncJson({
      configs: configs.map(syncConfigDto),
      legacyMappings: legacyMappings.map((mapping) => ({
        id: mapping.publicId,
        provider: mapping.provider,
        externalProjectId: mapping.externalProjectId,
        instanceUrl: mapping.instanceUrl,
      })),
    })
  } catch (error) {
    return syncApiError(error)
  }
}

export async function POST(request: Request, context: ProjectSyncContext) {
  try {
    const { project } = await ownedSyncProject(context)
    const body = await syncBody(request)
    onlyFields(body, [
      'provider',
      'instanceUrl',
      'sourceProject',
      'assignees',
      'tokenEnvVar',
      'approvedLabelMap',
    ])
    const assignees = parseAssignees(body.assignees)
    const approvedLabelMap = validateApprovedLabelMap(body.approvedLabelMap ?? {})
    if (
      !['gitlab', 'github'].includes(String(body.provider)) ||
      typeof body.instanceUrl !== 'string' ||
      typeof body.sourceProject !== 'string' ||
      !isTokenEnvVar(body.tokenEnvVar) ||
      !assignees ||
      !approvedLabelMap
    ) {
      throw new IssueSyncError(
        'VALIDATION_ERROR',
        'กรุณาระบุ provider, project, ชื่อตัวแปร token และ assignee อย่างน้อยหนึ่งคนให้ถูกต้อง',
        400,
      )
    }
    const credential = requiredCredential(body.tokenEnvVar, String(body.provider), body.instanceUrl)
    const source = await new IssueSourceClient(credential).resolveProject(body.sourceProject.trim())
    const config = await database.transaction(async (tx) => {
      const scope = {
        provider: credential.provider,
        instanceUrl: credential.baseUrl,
        externalProjectId: source.id,
      }
      const existing = await mappings.bySource(scope, tx)
      if (existing && existing.projectId !== project.id)
        throw new IssueSyncError(
          'SOURCE_ALREADY_MAPPED',
          'Source project นี้เชื่อมกับ PMS Project อื่นแล้ว',
          409,
        )
      if (await sourceReferences.conflicts(scope, project.id, tx)) {
        throw new IssueSyncError(
          'SOURCE_IDENTITY_CONFLICT',
          'Source project มีประวัติใน PMS Project อื่นอยู่แล้ว',
          409,
        )
      }
      const mapping = existing
        ? await mappings.update(existing.id, { approvedLabelMap, firstSyncApprovedAt: null }, tx)
        : await mappings.create({ ...scope, projectId: project.id, approvedLabelMap }, tx)
      return syncConfigs.create(
        {
          mappingId: mapping.id,
          sourceProjectPath: source.path,
          tokenEnvVar: credential.tokenEnvVar,
          assignees,
        },
        tx,
      )
    })
    return syncJson({ config: syncConfigDto(config) }, 201)
  } catch (error) {
    return syncApiError(error)
  }
}
