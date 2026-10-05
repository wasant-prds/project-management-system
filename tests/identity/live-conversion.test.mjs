import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { buildLiveLoadScript, parseLiveUpgradeArgs, planLiveSnapshot, readLiveMappings, writeLiveMappings } from '../../scripts/sql-live-upgrade.mjs'

const timestamp = '2026-10-04T10:00:00.000'
const tables = () => ({
  User: [{ id: 'owner-cuid', email: 'owner@fixture.invalid', name: 'Fixture owner', password: 'hash', role: 'owner', status: 'Active', theme: 'dark', locale: 'en', joinDate: timestamp, createdAt: timestamp, updatedAt: timestamp }],
  Company: [{ id: 'company-cuid', name: 'Fixture company', code: null, displayName: null, location: null, industry: null, email: null, phone: null, address: null, website: null, logo: null, description: null, createdAt: timestamp, updatedAt: timestamp }],
  Project: [{ id: 'project-cuid', name: 'Fixture project', description: null, status: 'In Progress', priority: 'High', startDate: '2026-10-01', dueDate: '2026-10-31', budget: '100.00', spent: '4.25', progress: '40', colorProject: null, createdAt: timestamp, updatedAt: timestamp, creatorId: 'owner-cuid', companyId: 'company-cuid' }],
  ProjectMember: [],
  work_items: [{ id: 'work-cuid', title: 'Fixture work', description: null, kind: 'Task', priority: 'medium', role: 'Developer', status: 'completed', labels_types: ['reviewed'], workDate: '2026-10-02', dueDate: null, submittedAt: null, createdAt: timestamp, updatedAt: timestamp, projectId: 'project-cuid', assigneeId: 'owner-cuid' }],
  TimeEntry: [{ id: 'entry-cuid', description: 'Fixture hours', remarks: null, hours: '1.250000000000000000000000000000', date: '2026-10-02', status: 'Completed', createdAt: timestamp, updatedAt: timestamp, userId: 'owner-cuid', projectId: 'project-cuid', workItemId: 'work-cuid' }],
  Milestone: [{ id: 'milestone-cuid', name: 'Fixture milestone', description: null, dueDate: '2026-10-10 10:30:00.000', status: 'In Progress', createdAt: timestamp, updatedAt: timestamp, projectId: 'project-cuid' }],
  Document: [],
  ActivityLog: [{ id: 'activity-cuid', action: 'updated', entity: 'task', entityId: 'work-cuid', description: null, metadata: { exact: true }, createdAt: timestamp, userId: 'owner-cuid', projectId: 'project-cuid' }],
  Comment: [{ id: 'comment-cuid', content: 'private fixture', authorId: 'owner-cuid', createdAt: timestamp, updatedAt: timestamp }],
  Notification: [{ id: 'notification-cuid', title: 'fixture', message: 'private fixture', userId: 'owner-cuid', createdAt: timestamp }],
  GitLabProjectMapping: [{ id: 'gitlab-map-cuid', canonicalGitLabInstanceUrl: 'https://gitlab.example.invalid', gitLabProjectId: '42', projectId: 'project-cuid', approvedLabelMap: { Bug: 'Incident' }, firstSyncApprovedAt: timestamp, createdAt: timestamp, updatedAt: timestamp }],
  ExternalWorkItemReference: [{ id: 'gitlab-ref-cuid', provider: 'gitlab', canonicalGitLabInstanceUrl: 'https://gitlab.example.invalid', gitLabProjectId: '42', gitLabGlobalIssueId: '9001', gitLabIssueIid: '19', externalUrl: 'https://gitlab.example.invalid/group/project/issues/19', projectId: 'project-cuid', remoteCreatedAt: timestamp, remoteUpdatedAt: timestamp, lastSyncedAt: timestamp, workItemId: 'work-cuid' }],
})

function publicIdGenerator() {
  let next = 1
  return () => `00000000-0000-4000-8000-${String(next++).padStart(12, '0')}`
}

test('TC-33-LIVE-01 maps legacy and newer GitLab records to numeric foreign keys and preserves source UUIDs on rerun', () => {
  const source = tables()
  const options = { sourceChecksum: 'a'.repeat(64), targetRevision: '31.0.0', ownerSelector: 'owner-cuid', createPublicId: publicIdGenerator() }
  const first = planLiveSnapshot({ tables: source, ...options })
  assert.equal(first.classification.kind, 'legacy')
  assert.equal(first.classification.newer, true)
  assert.equal(first.ownerPublicId, first.mappings.find((row) => row.entityName === 'users').newPublicId)
  assert.equal(first.converted.transformed.projects[0].company_id, first.mappings.find((row) => row.entityName === 'companies').newId)
  assert.equal(first.converted.transformed.work_logs[0].work_item_id, first.mappings.find((row) => row.entityName === 'work_items').newId)
  assert.equal(first.converted.transformed.external_project_mappings[0].project_id, first.mappings.find((row) => row.entityName === 'projects').newId)
  assert.equal(first.converted.transformed.external_work_item_references[0].work_item_id, first.mappings.find((row) => row.entityName === 'work_items').newId)
  assert.equal(first.converted.transformed.work_logs[0].hours, source.TimeEntry[0].hours)
  assert.equal(first.converted.transformed.activity_logs[0].entity_id, 'work-cuid')
  assert.deepEqual(Object.keys(first.rowsToPreserve).sort(), ['Comment', 'Notification'])

  const retry = planLiveSnapshot({
    ...options,
    sourceChecksum: 'b'.repeat(64),
    existingMappings: first.mappings,
    tables: source,
  })
  assert.deepEqual(retry.mappings, first.mappings)
  assert.deepEqual(retry.converted.transformed.work_logs, first.converted.transformed.work_logs)
})

test('TC-33-LIVE-02 refuses missing owner, unmapped Company, and unsupported source tables', () => {
  const source = tables()
  const options = { sourceChecksum: 'a'.repeat(64), targetRevision: '31.0.0', ownerSelector: 'owner-cuid', createPublicId: publicIdGenerator() }
  assert.throws(() => planLiveSnapshot({ tables: source, ...options, ownerSelector: '7' }), /Numeric OWNER_USER_ID is rejected/)
  assert.throws(() => planLiveSnapshot({
    tables: { ...source, Project: [{ ...source.Project[0], companyId: 'missing-company' }] }, ...options,
  }), /references a missing Company row/)
  assert.throws(() => planLiveSnapshot({ tables: { ...source, UndocumentedTable: [] }, ...options }), /reviewed preservation rule/)
})

test('TC-33-LIVE-03 emits one empty-target transaction with full row comparison and sequence alignment', () => {
  const planned = planLiveSnapshot({
    tables: tables(), sourceChecksum: 'a'.repeat(64), targetRevision: '31.0.0', ownerSelector: 'owner-cuid', createPublicId: publicIdGenerator(),
  })
  const sql = buildLiveLoadScript(planned.converted.transformed, 'uat')
  assert.match(sql, /^BEGIN;/)
  assert.match(sql, /replacement target is not empty/)
  assert.match(sql, /post-conversion row data mismatch/)
  assert.match(sql, /public\.pms_align_identity\('public\."external_work_item_references"'\)/)
  assert.match(sql, /COMMIT;/)
  assert.doesNotMatch(sql, /owner-cuid|company-cuid/)
})

test('TC-33-LIVE-04 persists live identity mappings and reuses them after process restart', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'pms-live-map-'))
  const mappingPath = join(directory, 'mappings.json')
  try {
    const first = planLiveSnapshot({
      tables: tables(), sourceChecksum: 'a'.repeat(64), targetRevision: '31.0.0', ownerSelector: 'owner-cuid', createPublicId: publicIdGenerator(),
    })
    await writeLiveMappings(mappingPath, first.mappings)
    const disk = JSON.parse(await readFile(mappingPath, 'utf8'))
    assert.equal(disk.length, first.mappings.length)
    assert.deepEqual(await readLiveMappings(mappingPath), first.mappings)
    const retry = planLiveSnapshot({
      tables: tables(), sourceChecksum: 'b'.repeat(64), targetRevision: '31.0.0', ownerSelector: 'owner-cuid',
      existingMappings: await readLiveMappings(mappingPath), createPublicId: () => { throw new Error('retry must not generate a new UUID') },
    })
    assert.deepEqual(retry.mappings, first.mappings)
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

test('TC-33-LIVE-05 exposes an explicit source, replacement target, and durable mapping CLI contract', () => {
  assert.throws(() => parseLiveUpgradeArgs(['apply', '--source', 'source.dump']), /explicit target/)
  assert.deepEqual(parseLiveUpgradeArgs([
    'apply', '--source', 'source.dump', '--target', 'postgresql://user@replacement.invalid/db', '--mapping', 'mappings.json', '--preserve', 'archive.json',
  ]), {
    source: 'source.dump', target: 'postgresql://user@replacement.invalid/db', mapping: 'mappings.json', preserve: 'archive.json',
  })
})
