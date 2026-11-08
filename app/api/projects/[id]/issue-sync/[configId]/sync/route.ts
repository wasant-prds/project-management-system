import { database } from '@/lib/database/client'
import { requiredCredential, IssueSyncError } from '@/lib/issue-sync-provider'
import { executeIssueSync, startIssueSync, syncRunDto } from '@/lib/issue-sync'
import {
  ownedSyncConfig,
  onlyFields,
  syncBody,
  syncJson,
  syncApiError,
  type ProjectSyncContext,
} from '@/lib/issue-sync-api'

export const maxDuration = 180

export async function POST(request: Request, context: ProjectSyncContext) {
  try {
    const { config, owner } = await ownedSyncConfig(context)
    const body = await syncBody(request)
    onlyFields(body, ['approveFirstSync'])
    if ('approveFirstSync' in body && typeof body.approveFirstSync !== 'boolean')
      throw new IssueSyncError('VALIDATION_ERROR', 'approveFirstSync ต้องเป็น boolean', 400)
    requiredCredential(config.tokenEnvVar, config.mapping.provider, config.mapping.instanceUrl)
    const run = await startIssueSync(database, config, body.approveFirstSync === true)
    const result = await executeIssueSync(database, config, run, owner.internalId)
    return syncJson({ run: syncRunDto(result) })
  } catch (error) {
    return syncApiError(error)
  }
}
