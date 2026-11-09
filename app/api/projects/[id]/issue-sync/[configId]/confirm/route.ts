import { database } from '@/lib/database/client'
import { confirmIssueSync, syncRunDto } from '@/lib/issue-sync'
import { IssueSyncError } from '@/lib/issue-sync-provider'
import { parsePublicId } from '@/lib/public-id'
import {
  ownedSyncConfig,
  onlyFields,
  syncBody,
  syncJson,
  syncApiError,
  type ProjectSyncContext,
} from '@/lib/issue-sync-api'
import type { IssueReviewDecision } from '@/lib/integrations/issue-review'

export const maxDuration = 180

export async function POST(request: Request, context: ProjectSyncContext) {
  try {
    const { config, owner } = await ownedSyncConfig(context)
    const body = await syncBody(request)
    onlyFields(body, ['runId', 'decisions'])
    const runId = parsePublicId(body.runId)
    if (!runId || !Array.isArray(body.decisions) || !body.decisions.length || body.decisions.length > 1000)
      throw new IssueSyncError('VALIDATION_ERROR', 'ต้องระบุ run UUID และคำตอบ 1–1,000 รายการ', 400)
    const decisions: IssueReviewDecision[] = body.decisions.map((entry: unknown) => {
      if (!entry || typeof entry !== 'object' || Array.isArray(entry))
        throw new IssueSyncError('VALIDATION_ERROR', 'คำตอบไม่ถูกต้อง', 400)
      const value = entry as Record<string, unknown>
      onlyFields(value, ['issueId', 'workItemId'])
      if (
        typeof value.issueId !== 'string' ||
        !/^[1-9]\d{0,127}$/.test(value.issueId) ||
        (value.workItemId !== null && !parsePublicId(value.workItemId))
      )
        throw new IssueSyncError(
          'VALIDATION_ERROR',
          'issueId ต้องเป็น source ID และ workItemId ต้องเป็น public UUID หรือ null',
          400,
        )
      return { issueId: value.issueId, workItemId: value.workItemId as string | null }
    })
    return syncJson({
      run: syncRunDto(await confirmIssueSync(database, config, runId, owner.internalId, decisions)),
    })
  } catch (error) {
    return syncApiError(error)
  }
}
