import { database } from '@/lib/database/client'
import { requiredCredential, IssueSyncError } from '@/lib/issue-sync-provider'
import { executeIssueSync, startIssueSync, syncRunDto } from '@/lib/issue-sync'
import { ISSUE_SYNC_STREAM_TYPE, type IssueSyncEvent } from '@/lib/integrations/issue-sync-stream'
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
    if (
      request.headers
        ?.get('accept')
        ?.split(',')
        .some((type) => type.trim() === ISSUE_SYNC_STREAM_TYPE)
    ) {
      let disconnected = false
      const encoder = new TextEncoder()
      const stream = new ReadableStream<Uint8Array>({
        async start(controller) {
          const send = (event: IssueSyncEvent<ReturnType<typeof syncRunDto>>) => {
            if (disconnected) return
            const data = encoder.encode(JSON.stringify(event) + '\n')
            try {
              controller.enqueue(data)
            } catch {
              disconnected = true
            }
          }
          try {
            const result = await executeIssueSync(
              database,
              config,
              run,
              owner.internalId,
              undefined,
              (progress) => send({ type: 'progress', progress }),
            )
            send({ type: 'result', run: syncRunDto(result) })
          } catch (error) {
            const response = syncApiError(error)
            const payload = await response.json()
            send({ type: 'error', error: payload.error })
          } finally {
            if (!disconnected) controller.close()
          }
        },
        cancel() {
          disconnected = true
        },
      })
      return new Response(stream, {
        headers: {
          'Content-Type': `${ISSUE_SYNC_STREAM_TYPE}; charset=utf-8`,
          'Cache-Control': 'no-store, no-transform',
          'X-Accel-Buffering': 'no',
          'X-Content-Type-Options': 'nosniff',
        },
      })
    }
    const result = await executeIssueSync(database, config, run, owner.internalId)
    return syncJson({ run: syncRunDto(result) })
  } catch (error) {
    return syncApiError(error)
  }
}
