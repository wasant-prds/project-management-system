import { syncConfigs, mappings } from '@/lib/database/repositories/issue-sync'
import { database } from '@/lib/database/client'
import { IssueSyncError, isTokenEnvVar, parseAssignees, requiredCredential } from '@/lib/issue-sync-provider'
import { validateApprovedLabelMap } from '@/lib/integrations/source-validation'
import { syncConfigDto } from '@/lib/issue-sync'
import {
  ownedSyncConfig,
  assertConfigIdle,
  onlyFields,
  syncBody,
  syncJson,
  syncApiError,
  type ProjectSyncContext,
} from '@/lib/issue-sync-api'

export async function PATCH(request: Request, context: ProjectSyncContext) {
  try {
    const { config } = await ownedSyncConfig(context)
    const body = await syncBody(request)
    onlyFields(body, ['assignees', 'tokenEnvVar', 'enabled', 'approvedLabelMap'])
    if (!Object.keys(body).length) throw new IssueSyncError('VALIDATION_ERROR', 'ไม่มีค่าที่แก้ไข', 400)
    const assignees = 'assignees' in body ? parseAssignees(body.assignees) : config.assignees
    const labelMap =
      'approvedLabelMap' in body
        ? validateApprovedLabelMap(body.approvedLabelMap)
        : validateApprovedLabelMap(config.mapping.approvedLabelMap)
    if (
      !assignees ||
      !labelMap ||
      ('enabled' in body && typeof body.enabled !== 'boolean') ||
      ('tokenEnvVar' in body && !isTokenEnvVar(body.tokenEnvVar))
    ) {
      throw new IssueSyncError(
        'VALIDATION_ERROR',
        'Config ไม่ถูกต้อง ต้องระบุ assignee อย่างน้อยหนึ่งคน',
        400,
      )
    }
    const tokenEnvVar = typeof body.tokenEnvVar === 'string' ? body.tokenEnvVar : config.tokenEnvVar
    const enabled = typeof body.enabled === 'boolean' ? body.enabled : config.enabled
    // Allow pausing a config even if the credential was removed or expired.
    if (enabled) requiredCredential(tokenEnvVar, config.mapping.provider, config.mapping.instanceUrl)
    const result = await database.transaction(async (tx) => {
      const current = await syncConfigs.byId(config.id, tx)
      if (!current) throw new IssueSyncError('NOT_FOUND', 'ไม่พบ config', 404)
      assertConfigIdle(current.leaseUntil)
      if (current.revision !== config.revision)
        throw new IssueSyncError('CONFLICT', 'Config เปลี่ยนแล้ว กรุณาโหลดใหม่', 409)
      const policyChanged =
        JSON.stringify(assignees) !== JSON.stringify(current.assignees) ||
        JSON.stringify(labelMap) !== JSON.stringify(config.mapping.approvedLabelMap) ||
        tokenEnvVar !== current.tokenEnvVar
      if (policyChanged)
        await mappings.update(config.mappingId, { approvedLabelMap: labelMap, firstSyncApprovedAt: null }, tx)
      return syncConfigs.update(
        config.id,
        {
          assignees,
          tokenEnvVar,
          enabled,
          revision: current.revision + 1,
        },
        tx,
      )
    })
    return syncJson({ config: syncConfigDto(result) })
  } catch (error) {
    return syncApiError(error)
  }
}
