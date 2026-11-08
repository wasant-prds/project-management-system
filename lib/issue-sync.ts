import type { Prisma, PrismaClient, IssueSyncConfig, GitLabProjectMapping, IssueSyncRun } from '@prisma/client'
import { currentBangkokWallClockDate, serializeBangkokTimestamp } from '@/lib/bangkok-datetime'
import { shouldStampSubmittedAt } from '@/lib/work-items'
import { validateApprovedLabelMap } from '@/lib/gitlab-issue-import'
import { IssueSourceClient, IssueSyncError, matchesAssignees, parseAssignees, requiredCredential, type SourceIssue } from '@/lib/issue-sync-provider'

export type SyncConfig = IssueSyncConfig & { mapping: GitLabProjectMapping }
type Outcome = { outcome: 'created' | 'updated' | 'skipped' | 'failed'; issueId: string | null; number: string | null; title: string; sourceUrl: string | null; workItemId: string | null; reason: string; warnings: string[] }
const counts = (results: Outcome[]) => ({
  createdCount: results.filter((result) => result.outcome === 'created').length,
  updatedCount: results.filter((result) => result.outcome === 'updated').length,
  skippedCount: results.filter((result) => result.outcome === 'skipped').length,
  failedCount: results.filter((result) => result.outcome === 'failed').length,
})

export function syncConfigDto(config: SyncConfig) {
  return {
    id: config.publicId, provider: config.mapping.provider, instanceUrl: config.mapping.canonicalGitLabInstanceUrl,
    sourceProject: config.sourceProjectPath, externalProjectId: config.mapping.gitLabProjectId,
    assignees: config.assignees, tokenEnvVar: config.tokenEnvVar, enabled: config.enabled,
    approvedLabelMap: config.mapping.approvedLabelMap,
    firstSyncApproved: Boolean(config.mapping.firstSyncApprovedAt),
    createdAt: serializeBangkokTimestamp(config.createdAt), updatedAt: serializeBangkokTimestamp(config.updatedAt),
  }
}

export function syncRunDto(run: IssueSyncRun) {
  return {
    id: run.publicId, status: run.status, configSnapshot: run.configSnapshot,
    counts: { created: run.createdCount, updated: run.updatedCount, skipped: run.skippedCount, failed: run.failedCount },
    results: run.results, runError: run.runError,
    startedAt: serializeBangkokTimestamp(run.createdAt), finishedAt: run.finishedAt ? serializeBangkokTimestamp(run.finishedAt) : null,
  }
}

function referenceScope(mapping: GitLabProjectMapping) {
  return { provider: mapping.provider, canonicalGitLabInstanceUrl: mapping.canonicalGitLabInstanceUrl, gitLabProjectId: mapping.gitLabProjectId }
}

function safeError(error: unknown) {
  return error instanceof IssueSyncError
    ? { code: error.code, message: error.message, retryable: error.retryable }
    : { code: 'SYNC_FAILED', message: 'บันทึกผล sync ไม่สำเร็จ กรุณาลองอีกครั้ง', retryable: true }
}

async function assertLease(tx: Prisma.TransactionClient, config: SyncConfig, run: IssueSyncRun) {
  const current = await tx.issueSyncConfig.findUnique({ where: { id: config.id }, include: { mapping: true } })
  if (!current?.enabled || current.revision !== config.revision || current.leaseToken !== run.publicId
    || current.tokenEnvVar !== config.tokenEnvVar || current.mappingId !== config.mappingId
    || current.sourceProjectPath !== config.sourceProjectPath || JSON.stringify(current.assignees) !== JSON.stringify(config.assignees)
    || !current.leaseUntil || current.leaseUntil <= currentBangkokWallClockDate()
    || current.mapping.updatedAt.getTime() !== config.mapping.updatedAt.getTime()) {
    throw new IssueSyncError('CONFIG_CHANGED', 'Config หรือสิทธิ์ของรอบ sync เปลี่ยนแล้ว กรุณาโหลดใหม่', 409)
  }
}

async function saveIssue(tx: Prisma.TransactionClient, config: SyncConfig, ownerId: bigint, issue: SourceIssue, labelMap: Record<string, string>): Promise<Outcome> {
  const mapping = config.mapping
  const identity = { ...referenceScope(mapping), gitLabGlobalIssueId: issue.id }
  const reference = await tx.externalWorkItemReference.findUnique({
    where: { provider_canonicalGitLabInstanceUrl_gitLabProjectId_gitLabGlobalIssueId: identity },
    include: { workItem: true },
  })
  const base = { issueId: issue.id, number: issue.number, title: issue.title, sourceUrl: issue.url, warnings: [] as string[], workItemId: reference?.workItem.publicId ?? null }
  if (reference && (reference.projectId !== mapping.projectId || reference.workItem.projectId !== mapping.projectId || reference.workItem.assigneeId !== ownerId)) {
    throw new IssueSyncError('SOURCE_IDENTITY_CONFLICT', 'Issue เชื่อมกับ Work Item นอก Project หรือ owner ที่กำหนด', 409)
  }
  // Never apply an older payload, including an older assignee membership.
  if (reference && issue.updatedAt < reference.remoteUpdatedAt) return { ...base, outcome: 'skipped', reason: 'stale_source' }
  if (!matchesAssignees(issue, config.assignees)) {
    if (reference) await tx.externalWorkItemReference.update({ where: { id: reference.id }, data: { inScope: false, remoteUpdatedAt: issue.updatedAt, lastSyncedAt: currentBangkokWallClockDate() } })
    return { ...base, outcome: 'skipped', reason: reference ? 'out_of_scope' : 'assignee_not_matched' }
  }
  const types = [...new Set(issue.labels.flatMap((label) => Object.hasOwn(labelMap, label) ? [labelMap[label]] : []))].sort()
  base.warnings = issue.labels.filter((label) => !Object.hasOwn(labelMap, label)).map((label) => `Unmapped label: ${label}`)
  const fields = {
    title: issue.title, description: issue.description, status: issue.status, types,
    ...(issue.dueDate !== undefined ? { dueDate: issue.dueDate } : {}),
  }
  const timestamp = currentBangkokWallClockDate()
  const external = { gitLabIssueIid: issue.number, externalUrl: issue.url, remoteCreatedAt: issue.createdAt, remoteUpdatedAt: issue.updatedAt, lastSyncedAt: timestamp, inScope: true }
  if (!reference) {
    const item = await tx.workItem.create({ data: {
      ...fields, kind: 'Issue', priority: 'none', role: null, workDate: null, projectId: mapping.projectId, assigneeId: ownerId,
      ...(shouldStampSubmittedAt(issue.status) ? { submittedAt: timestamp } : {}),
    }, select: { id: true, publicId: true } })
    await tx.externalWorkItemReference.create({ data: { ...identity, ...external, projectId: mapping.projectId, workItemId: item.id } })
    return { ...base, workItemId: item.publicId, outcome: 'created', reason: 'created_from_source' }
  }
  const item = reference.workItem
  const changed = item.title !== issue.title || item.description !== issue.description || item.status !== issue.status
    || JSON.stringify([...item.types].sort()) !== JSON.stringify(types)
    || (issue.dueDate !== undefined && (item.dueDate?.getTime() ?? null) !== (issue.dueDate?.getTime() ?? null))
  const referenceChanged = !reference.inScope || reference.remoteUpdatedAt.getTime() !== issue.updatedAt.getTime()
    || reference.remoteCreatedAt.getTime() !== issue.createdAt.getTime() || reference.externalUrl !== issue.url || reference.gitLabIssueIid !== issue.number
  if (changed) await tx.workItem.update({ where: { id: item.id }, data: {
    ...fields, ...(shouldStampSubmittedAt(issue.status) && !item.submittedAt ? { submittedAt: timestamp } : {}),
  } })
  await tx.externalWorkItemReference.update({ where: { id: reference.id }, data: external })
  return { ...base, outcome: changed || referenceChanged ? 'updated' : 'skipped', reason: changed || referenceChanged ? 'source_fields_changed' : 'no_changes' }
}

export async function startIssueSync(db: PrismaClient, config: SyncConfig, approveFirstSync: boolean) {
  if (!config.enabled || !parseAssignees(config.assignees)) throw new IssueSyncError('CONFIG_DISABLED', 'Config ยังไม่พร้อมหรือไม่ได้ระบุ assignee', 409)
  if (!config.mapping.firstSyncApprovedAt && !approveFirstSync) throw new IssueSyncError('FIRST_SYNC_APPROVAL_REQUIRED', 'กรุณายืนยันการ sync ครั้งแรก', 409)
  return db.$transaction(async (tx) => {
    const now = currentBangkokWallClockDate()
    const lease = await tx.issueSyncConfig.updateMany({ where: { id: config.id, revision: config.revision, enabled: true, OR: [{ leaseUntil: null }, { leaseUntil: { lte: now } }] }, data: { leaseUntil: new Date(now.getTime() + 300_000) } })
    if (lease.count !== 1) throw new IssueSyncError('SYNC_IN_PROGRESS', 'Config กำลัง sync หรือเปลี่ยนแปลงแล้ว กรุณาโหลดใหม่', 409)
    await tx.issueSyncRun.updateMany({ where: { configId: config.id, status: 'running' }, data: { status: 'failed', finishedAt: now, runError: { code: 'INTERRUPTED', message: 'รอบก่อนหน้าหยุดก่อนเสร็จ สามารถ sync ซ้ำได้', retryable: true } } })
    const mapping = await tx.gitLabProjectMapping.findUniqueOrThrow({ where: { id: config.mappingId } })
    if (mapping.updatedAt.getTime() !== config.mapping.updatedAt.getTime()) throw new IssueSyncError('CONFIG_CHANGED', 'Mapping เปลี่ยนแล้ว กรุณาโหลดใหม่', 409)
    if (!mapping.firstSyncApprovedAt) config.mapping = await tx.gitLabProjectMapping.update({ where: { id: mapping.id }, data: { firstSyncApprovedAt: now } })
    const run = await tx.issueSyncRun.create({ data: { configId: config.id, configSnapshot: {
      provider: mapping.provider, instanceUrl: mapping.canonicalGitLabInstanceUrl, sourceProject: config.sourceProjectPath,
      assignees: config.assignees, tokenEnvVar: config.tokenEnvVar, approvedLabelMap: mapping.approvedLabelMap,
    } } })
    await tx.issueSyncConfig.update({ where: { id: config.id }, data: { leaseToken: run.publicId } })
    return run
  }, { isolationLevel: 'Serializable' })
}

export async function executeIssueSync(db: PrismaClient, config: SyncConfig, run: IssueSyncRun, ownerId: bigint, client?: IssueSourceClient) {
  const results: Outcome[] = []
  let runError: ReturnType<typeof safeError> | undefined
  const source = { id: config.mapping.gitLabProjectId, path: config.sourceProjectPath }
  const labelMap = validateApprovedLabelMap(config.mapping.approvedLabelMap)
  const seen = new Set<string>()
  let processed = 0
  const processIssue = async (raw: unknown, expectedId?: string) => {
    let issue: SourceIssue | null = null
    let result: Outcome
    try {
      issue = client!.parseIssue(raw, source)
      if (issue && expectedId && issue.id !== expectedId) throw new IssueSyncError('SOURCE_IDENTITY_CHANGED', 'Issue number ถูกย้ายหรือเปลี่ยน identity', 409)
      if (issue && seen.has(issue.id)) return
      if (++processed > 1000) throw new IssueSyncError('ISSUE_LIMIT', 'รอบนี้เกิน 1,000 issues กรุณาปรับขอบเขตการ sync', 503, false)
      if (issue) seen.add(issue.id)
      for (let attempt = 0; ; attempt++) {
        try {
          result = await db.$transaction(async (tx) => {
            await assertLease(tx, config, run)
            const outcome: Outcome = issue ? await saveIssue(tx, config, ownerId, issue, labelMap!)
              : { outcome: 'skipped', issueId: null, number: null, title: '', sourceUrl: null, workItemId: null, reason: 'pull_request_excluded', warnings: [] }
            const next = [...results, outcome]
            await tx.issueSyncRun.update({ where: { id: run.id }, data: { ...counts(next), results: next } })
            return outcome
          }, { isolationLevel: 'Serializable' })
          break
        } catch (error) {
          const code = typeof error === 'object' && error && 'code' in error ? error.code : null
          if (attempt === 0 && (code === 'P2002' || code === 'P2034')) continue
          throw error
        }
      }
      results.push(result!)
    } catch (error) {
      if (error instanceof IssueSyncError && ['CONFIG_CHANGED', 'ISSUE_LIMIT'].includes(error.code)) throw error
      const safe = safeError(error)
      result = { outcome: 'failed', issueId: issue?.id ?? null, number: issue?.number ?? null, title: issue?.title ?? '', sourceUrl: issue?.url ?? null, workItemId: null, reason: safe.code, warnings: [safe.message] }
      results.push(result)
      await db.issueSyncRun.update({ where: { id: run.id }, data: { ...counts(results), results } })
    }
  }
  try {
    if (!labelMap || !parseAssignees(config.assignees)) throw new IssueSyncError('INVALID_CONFIG', 'Config ไม่ถูกต้อง', 409)
    client ??= new IssueSourceClient(requiredCredential(config.tokenEnvVar, config.mapping.provider, config.mapping.canonicalGitLabInstanceUrl))
    // Resolve and compare stable repository/project IDs on every run; renames cannot cross-link histories.
    const verified = await client.resolveProject(config.sourceProjectPath)
    if (verified.id !== source.id) throw new IssueSyncError('SOURCE_IDENTITY_CHANGED', 'Source project identity เปลี่ยน กรุณาตรวจ config', 409)
    for await (const raw of client.issues(source, config.assignees)) await processIssue(raw)
    // A filtered list cannot prove reassignment. Fetch absent known issues individually before marking out of scope.
    const references = await db.externalWorkItemReference.findMany({ where: referenceScope(config.mapping), select: { gitLabGlobalIssueId: true, gitLabIssueIid: true }, take: 1001 })
    if (references.length > 1000) throw new IssueSyncError('ISSUE_LIMIT', 'จำนวน issues เดิมเกิน 1,000 กรุณาตรวจขอบเขตการ sync')
    for (const reference of references) {
      if (!seen.has(reference.gitLabGlobalIssueId)) await processIssue(await client.issue(source, reference.gitLabIssueIid), reference.gitLabGlobalIssueId)
    }
  } catch (error) { runError = safeError(error) }
  return db.$transaction(async (tx) => {
    const currentRun = await tx.issueSyncRun.findUniqueOrThrow({ where: { id: run.id } })
    // A replacement run may already have marked this expired lease interrupted.
    // Keep that durable result and never release the replacement run's lease.
    if (currentRun.status !== 'running') return currentRun
    const finished = await tx.issueSyncRun.update({ where: { id: run.id }, data: {
      status: runError || results.some((result) => result.outcome === 'failed') ? results.some((result) => result.outcome !== 'failed') ? 'partial' : 'failed' : 'success',
      ...counts(results), results, ...(runError ? { runError } : {}), finishedAt: currentBangkokWallClockDate(),
    } })
    await tx.issueSyncConfig.updateMany({ where: { id: config.id, leaseToken: run.publicId }, data: { leaseUntil: null, leaseToken: null } })
    return finished
  })
}
