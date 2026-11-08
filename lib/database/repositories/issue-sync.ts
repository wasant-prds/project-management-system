import { database } from '../client'
import { sql } from '../sql'
import { configColumns, mappingColumns, referenceColumns, runColumns } from '../projections'
import { insertRecord, updateRecord } from '../records'
import { workItems } from './work-items'
import type { SourceMapping, IssueSyncConfig, IssueSyncRun, ExternalWorkItemReference } from '../types'

export type SyncConfig = IssueSyncConfig & { mapping: SourceMapping }
export type SourceScope = { provider: string; instanceUrl: string; externalProjectId: string }
const mappingData = (data: Partial<SourceMapping>) => ({
  provider: data.provider,
  instance_url: data.instanceUrl,
  external_project_id: data.externalProjectId,
  project_id: data.projectId,
  approved_label_map: data.approvedLabelMap === undefined ? undefined : JSON.stringify(data.approvedLabelMap),
  first_sync_approved_at: data.firstSyncApprovedAt,
})
const configData = (data: Partial<IssueSyncConfig>) => ({
  mapping_id: data.mappingId,
  source_project_path: data.sourceProjectPath,
  assignees: data.assignees,
  token_env_var: data.tokenEnvVar,
  enabled: data.enabled,
  revision: data.revision,
  lease_until: data.leaseUntil,
  lease_token: data.leaseToken,
})
const referenceData = (data: Partial<ExternalWorkItemReference>) => ({
  provider: data.provider,
  instance_url: data.instanceUrl,
  external_project_id: data.externalProjectId,
  external_issue_id: data.externalIssueId,
  external_issue_number: data.externalIssueNumber,
  external_url: data.externalUrl,
  project_id: data.projectId,
  remote_created_at: data.remoteCreatedAt,
  remote_updated_at: data.remoteUpdatedAt,
  last_synced_at: data.lastSyncedAt,
  in_scope: data.inScope,
  work_item_id: data.workItemId,
})
const runData = (data: Partial<IssueSyncRun>) => ({
  config_id: data.configId,
  status: data.status,
  config_snapshot: data.configSnapshot === undefined ? undefined : JSON.stringify(data.configSnapshot),
  created_count: data.createdCount,
  updated_count: data.updatedCount,
  skipped_count: data.skippedCount,
  failed_count: data.failedCount,
  results: data.results === undefined ? undefined : JSON.stringify(data.results),
  run_error:
    data.runError === undefined ? undefined : data.runError === null ? null : JSON.stringify(data.runError),
  finished_at: data.finishedAt,
})
export const mappings = {
  byId: (id: bigint, connection = database) =>
    connection.one<SourceMapping>(
      sql`SELECT ${mappingColumns} FROM external_project_mappings m WHERE m.id=${id}`,
    ),
  bySource: (scope: SourceScope, connection = database) =>
    connection.one<SourceMapping>(
      sql`SELECT ${mappingColumns} FROM external_project_mappings m WHERE m.provider=${scope.provider} AND m.instance_url=${scope.instanceUrl} AND m.external_project_id=${scope.externalProjectId}`,
    ),
  legacy: (projectId: bigint, connection = database) =>
    connection.rows<SourceMapping>(
      sql`SELECT ${mappingColumns} FROM external_project_mappings m WHERE m.project_id=${projectId} AND NOT EXISTS(SELECT 1 FROM issue_sync_configs s WHERE s.mapping_id=m.id)`,
    ),
  async create(data: Partial<SourceMapping>, connection = database) {
    return (await mappings.byId(
      await insertRecord(connection, 'external_project_mappings', mappingData(data)),
      connection,
    ))!
  },
  async update(id: bigint, data: Partial<SourceMapping>, connection = database) {
    await updateRecord(connection, 'external_project_mappings', id, mappingData(data))
    return (await mappings.byId(id, connection))!
  },
}
export const syncConfigs = {
  async byId(id: bigint, connection = database): Promise<SyncConfig | null> {
    const config = await connection.one<IssueSyncConfig>(
      sql`SELECT ${configColumns} FROM issue_sync_configs s WHERE s.id=${id}`,
    )
    if (!config) return null
    const mapping = await mappings.byId(config.mappingId, connection)
    return mapping ? { ...config, mapping } : null
  },
  async byPublicId(publicId: string, projectId: bigint, connection = database) {
    const row = await connection.one<{ id: bigint }>(
      sql`SELECT s.id FROM issue_sync_configs s JOIN external_project_mappings m ON m.id=s.mapping_id WHERE s.public_id=${publicId}::uuid AND m.project_id=${projectId}`,
    )
    return row ? syncConfigs.byId(row.id, connection) : null
  },
  async list(projectId: bigint, connection = database): Promise<SyncConfig[]> {
    const rows = await connection.rows<{ id: bigint }>(
      sql`SELECT s.id FROM issue_sync_configs s JOIN external_project_mappings m ON m.id=s.mapping_id WHERE m.project_id=${projectId} ORDER BY s.id`,
    )
    return (await Promise.all(rows.map((row) => syncConfigs.byId(row.id, connection)))).filter(
      (row): row is SyncConfig => row !== null,
    )
  },
  async create(data: Partial<IssueSyncConfig>, connection = database) {
    return (await syncConfigs.byId(
      await insertRecord(connection, 'issue_sync_configs', configData(data)),
      connection,
    ))!
  },
  async update(id: bigint, data: Partial<IssueSyncConfig>, connection = database) {
    await updateRecord(connection, 'issue_sync_configs', id, configData(data))
    return (await syncConfigs.byId(id, connection))!
  },
  acquireLease: (id: bigint, revision: number, now: Date, until: Date, connection = database) =>
    connection.execute(
      sql`UPDATE issue_sync_configs SET lease_until=${until} WHERE id=${id} AND enabled AND revision=${revision} AND (lease_until IS NULL OR lease_until<=${now})`,
    ),
  releaseLease: (id: bigint, token: string, connection = database) =>
    connection.execute(
      sql`UPDATE issue_sync_configs SET lease_until=NULL,lease_token=NULL WHERE id=${id} AND lease_token=${token}::uuid`,
    ),
}
export const syncRuns = {
  byId: (id: bigint, connection = database) =>
    connection.one<IssueSyncRun>(sql`SELECT ${runColumns} FROM issue_sync_runs r WHERE r.id=${id}`),
  byPublicId: (publicId: string, configId: bigint, connection = database) =>
    connection.one<IssueSyncRun>(
      sql`SELECT ${runColumns} FROM issue_sync_runs r WHERE r.public_id=${publicId}::uuid AND r.config_id=${configId}`,
    ),
  list: (configId: bigint, limit: number, beforeId?: bigint, connection = database) =>
    connection.rows<IssueSyncRun>(
      sql`SELECT ${runColumns} FROM issue_sync_runs r WHERE r.config_id=${configId} ${beforeId ? sql`AND r.id<${beforeId}` : sql``} ORDER BY r.id DESC LIMIT ${limit}`,
    ),
  async create(data: Partial<IssueSyncRun>, connection = database) {
    return (await syncRuns.byId(
      await insertRecord(connection, 'issue_sync_runs', runData(data)),
      connection,
    ))!
  },
  async update(id: bigint, data: Partial<IssueSyncRun>, connection = database) {
    await updateRecord(connection, 'issue_sync_runs', id, runData(data))
    return (await syncRuns.byId(id, connection))!
  },
  interrupt: (configId: bigint, now: Date, connection = database) =>
    connection.execute(
      sql`UPDATE issue_sync_runs SET status='failed',finished_at=${now},run_error=${JSON.stringify({ code: 'INTERRUPTED', message: 'รอบก่อนหน้าหยุดก่อนเสร็จ สามารถ sync ซ้ำได้', retryable: true })}::jsonb WHERE config_id=${configId} AND status='running'`,
    ),
}
export const sourceReferences = {
  async byIdentity(scope: SourceScope, issueId: string, connection = database) {
    const row = await connection.one<ExternalWorkItemReference>(
      sql`SELECT ${referenceColumns} FROM external_work_item_references r WHERE r.provider=${scope.provider} AND r.instance_url=${scope.instanceUrl} AND r.external_project_id=${scope.externalProjectId} AND r.external_issue_id=${issueId}`,
    )
    if (!row) return null
    const workItem = await workItems.byId(row.workItemId, connection)
    return workItem ? { ...row, workItem } : null
  },
  list: (scope: SourceScope, connection = database) =>
    connection.rows<ExternalWorkItemReference>(
      sql`SELECT ${referenceColumns} FROM external_work_item_references r WHERE r.provider=${scope.provider} AND r.instance_url=${scope.instanceUrl} AND r.external_project_id=${scope.externalProjectId} ORDER BY r.id LIMIT 1001`,
    ),
  conflicts: async (scope: SourceScope, projectId: bigint, connection = database) =>
    (await connection.one<{ count: number }>(
      sql`SELECT count(*)::int AS count FROM external_work_item_references r WHERE r.provider=${scope.provider} AND r.instance_url=${scope.instanceUrl} AND r.external_project_id=${scope.externalProjectId} AND r.project_id<>${projectId}`,
    ))!.count,
  create: (data: Partial<ExternalWorkItemReference>, connection = database) =>
    insertRecord(connection, 'external_work_item_references', referenceData(data)),
  update: (id: bigint, data: Partial<ExternalWorkItemReference>, connection = database) =>
    updateRecord(connection, 'external_work_item_references', id, referenceData(data)),
}
