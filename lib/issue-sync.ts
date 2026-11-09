import type { Database } from '@/lib/database/client'
import type { IssueSyncConfig, SourceMapping, IssueSyncRun } from '@/lib/database/types'
import { syncConfigs, syncRuns, mappings, sourceReferences } from '@/lib/database/repositories/issue-sync'
import { workItems } from '@/lib/database/repositories/work-items'
import { currentBangkokWallClockDate, serializeBangkokTimestamp } from '@/lib/bangkok-datetime'
import { shouldStampSubmittedAt } from '@/lib/work-items'
import { issueTitleParts, matchesUnlinkedIssue, syncedIssueFields } from '@/lib/integrations/issue-content'
import { validateApprovedLabelMap } from '@/lib/integrations/source-validation'
import {
  IssueSourceClient,
  IssueSyncError,
  matchesAssignees,
  parseAssignees,
  requiredCredential,
  type SourceIssue,
} from '@/lib/issue-sync-provider'

export type SyncConfig = IssueSyncConfig & { mapping: SourceMapping }
type Outcome = {
  outcome: 'created' | 'updated' | 'skipped' | 'failed'
  issueId: string | null
  number: string | null
  title: string
  sourceUrl: string | null
  workItemId: string | null
  reason: string
  warnings: string[]
}
const counts = (results: Outcome[]) => ({
  createdCount: results.filter((result) => result.outcome === 'created').length,
  updatedCount: results.filter((result) => result.outcome === 'updated').length,
  skippedCount: results.filter((result) => result.outcome === 'skipped').length,
  failedCount: results.filter((result) => result.outcome === 'failed').length,
})

export function syncConfigDto(config: SyncConfig) {
  return {
    id: config.publicId,
    provider: config.mapping.provider,
    instanceUrl: config.mapping.instanceUrl,
    sourceProject: config.sourceProjectPath,
    externalProjectId: config.mapping.externalProjectId,
    assignees: config.assignees,
    tokenEnvVar: config.tokenEnvVar,
    enabled: config.enabled,
    approvedLabelMap: config.mapping.approvedLabelMap,
    firstSyncApproved: Boolean(config.mapping.firstSyncApprovedAt),
    createdAt: serializeBangkokTimestamp(config.createdAt),
    updatedAt: serializeBangkokTimestamp(config.updatedAt),
  }
}

export function syncRunDto(run: IssueSyncRun) {
  return {
    id: run.publicId,
    status: run.status,
    configSnapshot: run.configSnapshot,
    counts: {
      created: run.createdCount,
      updated: run.updatedCount,
      skipped: run.skippedCount,
      failed: run.failedCount,
    },
    results: run.results,
    runError: run.runError,
    startedAt: serializeBangkokTimestamp(run.createdAt),
    finishedAt: run.finishedAt ? serializeBangkokTimestamp(run.finishedAt) : null,
  }
}

function referenceScope(mapping: SourceMapping) {
  return {
    provider: mapping.provider,
    instanceUrl: mapping.instanceUrl,
    externalProjectId: mapping.externalProjectId,
  }
}

function safeError(error: unknown) {
  return error instanceof IssueSyncError
    ? {
        code: error.code,
        message: error.message,
        retryable: error.retryable,
        ...(error.providerFailure ? { providerFailure: error.providerFailure } : {}),
      }
    : { code: 'SYNC_FAILED', message: 'บันทึกผล sync ไม่สำเร็จ กรุณาลองอีกครั้ง', retryable: true }
}

async function assertLease(tx: Database, config: SyncConfig, run: IssueSyncRun) {
  const current = await syncConfigs.byId(config.id, tx)
  if (
    !current?.enabled ||
    current.revision !== config.revision ||
    current.leaseToken !== run.publicId ||
    current.tokenEnvVar !== config.tokenEnvVar ||
    current.mappingId !== config.mappingId ||
    current.sourceProjectPath !== config.sourceProjectPath ||
    JSON.stringify(current.assignees) !== JSON.stringify(config.assignees) ||
    !current.leaseUntil ||
    current.leaseUntil <= currentBangkokWallClockDate() ||
    current.mapping.updatedAt.getTime() !== config.mapping.updatedAt.getTime()
  ) {
    throw new IssueSyncError('CONFIG_CHANGED', 'Config หรือสิทธิ์ของรอบ sync เปลี่ยนแล้ว กรุณาโหลดใหม่', 409)
  }
}

async function saveIssue(
  tx: Database,
  config: SyncConfig,
  ownerId: bigint,
  issue: SourceIssue,
  labelMap: Record<string, string>,
): Promise<Outcome> {
  const mapping = config.mapping
  const identity = { ...referenceScope(mapping), externalIssueId: issue.id }
  const reference = await sourceReferences.byIdentity(referenceScope(mapping), issue.id, tx)
  let item = reference?.workItem ?? null
  const base = {
    issueId: issue.id,
    number: issue.number,
    title: issue.title,
    sourceUrl: issue.url,
    warnings: [] as string[],
    workItemId: item?.publicId ?? null,
  }
  if (
    reference &&
    (reference.projectId !== mapping.projectId ||
      (item && (item.projectId !== mapping.projectId || item.assigneeId !== ownerId)))
  )
    throw new IssueSyncError(
      'SOURCE_IDENTITY_CONFLICT',
      'Issue เชื่อมกับ Work Item นอก Project หรือ owner ที่กำหนด',
      409,
    )
  if (reference && issue.updatedAt < reference.remoteUpdatedAt)
    return { ...base, outcome: 'skipped', reason: 'stale_source' }
  if (!matchesAssignees(issue, config.assignees)) {
    if (reference)
      await sourceReferences.update(
        reference.id,
        { inScope: false, remoteUpdatedAt: issue.updatedAt, lastSyncedAt: currentBangkokWallClockDate() },
        tx,
      )
    return { ...base, outcome: 'skipped', reason: reference ? 'out_of_scope' : 'assignee_not_matched' }
  }
  if (!reference && (await sourceReferences.byLocator(referenceScope(mapping), issue.number, issue.url, tx)))
    throw new IssueSyncError(
      'SOURCE_IDENTITY_CONFLICT',
      'เลข Issue หรือ URL ต้นทางผูกกับ source ID อื่นแล้ว กรุณาตรวจประวัติก่อน sync',
      409,
    )
  let adopted = false
  if (!item) {
    const stem = issueTitleParts(issue.title).stem
    if (!stem) throw new IssueSyncError('INVALID_SOURCE', 'Issue ไม่มีชื่อเรื่อง')
    const candidates = (
      await workItems.syncCandidates(mapping.projectId, ownerId, stem, issue.url, tx)
    ).filter((candidate) => matchesUnlinkedIssue(candidate, issue))
    if (candidates.length > 1)
      throw new IssueSyncError(
        'LOCAL_ISSUE_CONFLICT',
        'พบ Work Item เดิมที่ตรงกันหลายรายการ กรุณาตรวจรายการซ้ำก่อน sync',
        409,
      )
    item = candidates[0] ?? null
    if (item) {
      await workItems.lock(item.id, ownerId, tx)
      adopted = true
    }
  }
  const { fields, warnings } = syncedIssueFields(issue, labelMap, item)
  base.title = fields.title
  base.warnings = warnings
  const timestamp = currentBangkokWallClockDate()
  const external = {
    externalIssueNumber: issue.number,
    externalUrl: issue.url,
    remoteCreatedAt: issue.createdAt,
    remoteUpdatedAt: issue.updatedAt,
    lastSyncedAt: timestamp,
    inScope: true,
  }
  if (!item) {
    item = await workItems.create(
      {
        ...fields,
        workDate: null,
        projectId: mapping.projectId,
        assigneeId: ownerId,
        submittedAt: shouldStampSubmittedAt(fields.status) ? timestamp : null,
      },
      tx,
    )
    if (reference) await sourceReferences.update(reference.id, { ...external, workItemId: item.id }, tx)
    else
      await sourceReferences.create(
        { ...identity, ...external, projectId: mapping.projectId, workItemId: item.id },
        tx,
      )
    return { ...base, workItemId: item.publicId, outcome: 'created', reason: 'created_from_source' }
  }
  base.workItemId = item.publicId
  const stampSubmitted = shouldStampSubmittedAt(fields.status) && !item.submittedAt
  const changed =
    item.title !== fields.title ||
    item.description !== fields.description ||
    item.status !== fields.status ||
    item.kind !== fields.kind ||
    item.priority !== fields.priority ||
    item.role !== fields.role ||
    !Array.isArray(item.types) ||
    JSON.stringify([...item.types].sort()) !== JSON.stringify(fields.types) ||
    (issue.dueDate !== undefined &&
      (item.dueDate?.getTime() ?? null) !== (issue.dueDate?.getTime() ?? null)) ||
    stampSubmitted
  if (changed)
    await workItems.update(item.id, { ...fields, ...(stampSubmitted ? { submittedAt: timestamp } : {}) }, tx)
  if (!reference) {
    await sourceReferences.create(
      { ...identity, ...external, projectId: mapping.projectId, workItemId: item.id },
      tx,
    )
    return { ...base, outcome: 'updated', reason: 'linked_existing_work_item' }
  }
  const referenceChanged =
    !reference.inScope ||
    !reference.workItem ||
    reference.remoteUpdatedAt.getTime() !== issue.updatedAt.getTime() ||
    reference.remoteCreatedAt.getTime() !== issue.createdAt.getTime() ||
    reference.externalUrl !== issue.url ||
    reference.externalIssueNumber !== issue.number
  await sourceReferences.update(
    reference.id,
    { ...external, ...(adopted ? { workItemId: item.id } : {}) },
    tx,
  )
  return {
    ...base,
    outcome: changed || referenceChanged ? 'updated' : 'skipped',
    reason: adopted
      ? 'linked_existing_work_item'
      : changed || referenceChanged
        ? 'source_fields_changed'
        : 'no_changes',
  }
}

export async function startIssueSync(db: Database, config: SyncConfig, approveFirstSync: boolean) {
  if (!config.enabled || !parseAssignees(config.assignees))
    throw new IssueSyncError('CONFIG_DISABLED', 'Config ยังไม่พร้อมหรือไม่ได้ระบุ assignee', 409)
  if (!config.mapping.firstSyncApprovedAt && !approveFirstSync)
    throw new IssueSyncError('FIRST_SYNC_APPROVAL_REQUIRED', 'กรุณายืนยันการ sync ครั้งแรก', 409)
  return db.transaction(async (tx) => {
    const now = currentBangkokWallClockDate()
    const lease = await syncConfigs.acquireLease(
      config.id,
      config.revision,
      now,
      new Date(now.getTime() + 300_000),
      tx,
    )
    if (lease !== 1)
      throw new IssueSyncError('SYNC_IN_PROGRESS', 'Config กำลัง sync หรือเปลี่ยนแปลงแล้ว กรุณาโหลดใหม่', 409)
    await syncRuns.interrupt(config.id, now, tx)
    const mapping = await mappings.byId(config.mappingId, tx)
    if (!mapping) throw new IssueSyncError('CONFIG_CHANGED', 'ไม่พบ mapping', 409)
    if (mapping.updatedAt.getTime() !== config.mapping.updatedAt.getTime())
      throw new IssueSyncError('CONFIG_CHANGED', 'Mapping เปลี่ยนแล้ว กรุณาโหลดใหม่', 409)
    if (!mapping.firstSyncApprovedAt)
      config.mapping = await mappings.update(mapping.id, { firstSyncApprovedAt: now }, tx)
    const run = await syncRuns.create(
      {
        configId: config.id,
        configSnapshot: {
          provider: mapping.provider,
          instanceUrl: mapping.instanceUrl,
          sourceProject: config.sourceProjectPath,
          assignees: config.assignees,
          tokenEnvVar: config.tokenEnvVar,
          approvedLabelMap: mapping.approvedLabelMap,
        },
      },
      tx,
    )
    await syncConfigs.update(config.id, { leaseToken: run.publicId }, tx)
    return run
  })
}

export async function executeIssueSync(
  db: Database,
  config: SyncConfig,
  run: IssueSyncRun,
  ownerId: bigint,
  client?: IssueSourceClient,
) {
  const results: Outcome[] = []
  let runError: ReturnType<typeof safeError> | undefined
  const source = { id: config.mapping.externalProjectId, path: config.sourceProjectPath }
  const labelMap = validateApprovedLabelMap(config.mapping.approvedLabelMap)
  const seen = new Set<string>()
  let processed = 0
  const processIssue = async (raw: unknown, expectedId?: string) => {
    let issue: SourceIssue | null = null
    let result: Outcome
    try {
      issue = client!.parseIssue(raw, source)
      if (issue && expectedId && issue.id !== expectedId)
        throw new IssueSyncError('SOURCE_IDENTITY_CHANGED', 'Issue number ถูกย้ายหรือเปลี่ยน identity', 409)
      if (issue && seen.has(issue.id)) return
      if (++processed > 1000)
        throw new IssueSyncError('ISSUE_LIMIT', 'รอบนี้เกิน 1,000 issues กรุณาปรับขอบเขตการ sync', 503, false)
      if (issue) seen.add(issue.id)
      for (let attempt = 0; ; attempt++) {
        try {
          result = await db.transaction(async (tx) => {
            await assertLease(tx, config, run)
            const outcome: Outcome = issue
              ? await saveIssue(tx, config, ownerId, issue, labelMap!)
              : {
                  outcome: 'skipped',
                  issueId: null,
                  number: null,
                  title: '',
                  sourceUrl: null,
                  workItemId: null,
                  reason: 'pull_request_excluded',
                  warnings: [],
                }
            const next = [...results, outcome]
            await syncRuns.update(run.id, { ...counts(next), results: next }, tx)
            return outcome
          })
          break
        } catch (error) {
          const code = typeof error === 'object' && error && 'code' in error ? error.code : null
          if (attempt === 0 && (code === '23505' || code === '40001' || code === '40P01')) continue
          throw error
        }
      }
      results.push(result!)
    } catch (error) {
      if (error instanceof IssueSyncError && ['CONFIG_CHANGED', 'ISSUE_LIMIT'].includes(error.code))
        throw error
      const safe = safeError(error)
      result = {
        outcome: 'failed',
        issueId: issue?.id ?? null,
        number: issue?.number ?? null,
        title: issue?.title ?? '',
        sourceUrl: issue?.url ?? null,
        workItemId: null,
        reason: safe.code,
        warnings: [safe.message],
      }
      results.push(result)
      await syncRuns.update(run.id, { ...counts(results), results }, db)
    }
  }
  try {
    if (!labelMap || !parseAssignees(config.assignees))
      throw new IssueSyncError('INVALID_CONFIG', 'Config ไม่ถูกต้อง', 409)
    client ??= new IssueSourceClient(
      requiredCredential(config.tokenEnvVar, config.mapping.provider, config.mapping.instanceUrl),
    )
    // Resolve and compare stable repository/project IDs on every run; renames cannot cross-link histories.
    const verified = await client.resolveProject(config.sourceProjectPath)
    if (verified.id !== source.id)
      throw new IssueSyncError(
        'SOURCE_IDENTITY_CHANGED',
        'Source project identity เปลี่ยน กรุณาตรวจ config',
        409,
      )
    for await (const raw of client.issues(source, config.assignees)) await processIssue(raw)
    // A filtered list cannot prove reassignment. Fetch absent known issues individually before marking out of scope.
    const references = await sourceReferences.list(referenceScope(config.mapping), db)
    if (references.length > 1000)
      throw new IssueSyncError('ISSUE_LIMIT', 'จำนวน issues เดิมเกิน 1,000 กรุณาตรวจขอบเขตการ sync')
    for (const reference of references) {
      if (!seen.has(reference.externalIssueId))
        await processIssue(
          await client.issue(source, reference.externalIssueNumber),
          reference.externalIssueId,
        )
    }
  } catch (error) {
    runError = safeError(error)
  }
  return db.transaction(async (tx) => {
    const currentRun = await syncRuns.byId(run.id, tx)
    // A replacement run may already have marked this expired lease interrupted.
    // Keep that durable result and never release the replacement run's lease.
    if (!currentRun) throw new Error('Sync run no longer exists')
    if (currentRun.status !== 'running') return currentRun
    const finished = await syncRuns.update(
      run.id,
      {
        status:
          runError || results.some((result) => result.outcome === 'failed')
            ? results.some((result) => result.outcome !== 'failed')
              ? 'partial'
              : 'failed'
            : 'success',
        ...counts(results),
        results,
        ...(runError ? { runError } : {}),
        finishedAt: currentBangkokWallClockDate(),
      },
      tx,
    )
    await syncConfigs.releaseLease(config.id, run.publicId, tx)
    return finished
  })
}
