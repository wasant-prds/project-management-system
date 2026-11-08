import assert from 'node:assert/strict'
import { PrismaClient } from '@prisma/client'
import { loader, rawIssue } from './support.mjs'
import { runRuntime } from '../../scripts/sql-runtime.mjs'

const load = loader()
const { IssueSourceClient, requiredCredential } = load('lib/issue-sync-provider.ts')
const { startIssueSync, executeIssueSync } = load('lib/issue-sync.ts')
const prisma = new PrismaClient({ log: [] })
try {
  await runRuntime('apply', { ...process.env, APP_ENV: 'local', DB_SCHEMA_SYNC_APPROVED: 'true', PMS_SQL_RUNTIME_APPLY: '1', RUN_SEED: 'false' })
  const owner = await prisma.user.create({ data: { name: 'Synthetic owner', email: 'owner@fixture.invalid', password: 'synthetic' } })
  const company = await prisma.company.create({ data: { name: 'Synthetic company' } })
  const project = await prisma.project.create({ data: { name: 'Synthetic project', companyId: company.id, startDate: new Date('2026-11-01'), dueDate: new Date('2026-12-01') } })
  for (const provider of ['gitlab', 'github']) {
    const baseUrl = provider === 'github' ? 'https://github.com' : 'https://gitlab.example.test/base'
    const mapping = await prisma.gitLabProjectMapping.create({ data: { provider, canonicalGitLabInstanceUrl: baseUrl, gitLabProjectId: '42', projectId: project.id, approvedLabelMap: { bug: 'bug' } } })
    const config = await prisma.issueSyncConfig.create({ data: { mappingId: mapping.id, sourceProjectPath: provider === 'github' ? 'acme/repo' : 'group/project', assignees: ['alice', 'bob'], tokenEnvVar: `${provider.toUpperCase()}_TEST_TOKEN` } })
    const token = `synthetic-${provider}-never-sent-to-network`
    process.env[config.tokenEnvVar] = token
    let rows = [rawIssue(provider)]
    let absent = rows[0]
    const client = new IssueSourceClient(requiredCredential(config.tokenEnvVar, provider, baseUrl), async (url, options) => {
      assert.equal(options.headers[provider === 'github' ? 'Authorization' : 'PRIVATE-TOKEN'], provider === 'github' ? `Bearer ${token}` : token)
      const path = new URL(url).pathname
      if ((path.includes('/projects/') && !path.includes('/issues')) || path.endsWith('/acme/repo')) return new Response(JSON.stringify({ id: 42, path_with_namespace: 'group/project', full_name: 'acme/repo' }))
      if (path.endsWith('/issues/17')) return new Response(JSON.stringify(absent))
      if (path.endsWith('/issues')) return new Response(JSON.stringify(rows))
      throw new Error('Unexpected provider request')
    })
    const sync = async () => {
      const current = await prisma.issueSyncConfig.findUniqueOrThrow({ where: { id: config.id }, include: { mapping: true } })
      const run = await startIssueSync(prisma, current, true)
      return executeIssueSync(prisma, current, run, owner.id, client)
    }
    const first = await sync()
    assert.equal(first.status, 'success', JSON.stringify({ runError: first.runError, results: first.results }))
    assert.equal(first.createdCount, 1)
    const reference = await prisma.externalWorkItemReference.findFirstOrThrow({ where: { provider }, include: { workItem: true } })
    const item = reference.workItem
    assert.match(item.publicId, /^[0-9a-f]{8}-[0-9a-f]{4}-4/)
    await prisma.workItem.update({ where: { id: item.id }, data: { priority: 'urgent', role: 'infra' } })
    await prisma.timeEntry.create({ data: { userId: owner.id, projectId: project.id, workItemId: item.id, hours: '1.25', date: new Date('2026-11-03') } })
    assert.equal((await sync()).skippedCount, 1)
    rows = []
    absent = rawIssue(provider, { assignees: [], title: 'Must not overwrite', updated_at: '2026-10-04T01:00:00Z' })
    assert.equal((await sync()).results[0].reason, 'out_of_scope')
    assert.equal((await prisma.externalWorkItemReference.findUniqueOrThrow({ where: { id: reference.id } })).inScope, false)
    assert.equal((await prisma.workItem.findUniqueOrThrow({ where: { id: item.id } })).title, item.title)
    rows = [rawIssue(provider, { title: 'Resumed', state: 'closed', updated_at: '2026-10-05T01:00:00Z' })]
    assert.equal((await sync()).updatedCount, 1)
    const resumed = await prisma.workItem.findUniqueOrThrow({ where: { id: item.id } })
    assert.equal(resumed.publicId, item.publicId)
    assert.equal(resumed.status, 'completed')
    assert.equal(resumed.priority, 'urgent')
    assert.equal(resumed.role, 'infra')
    assert.equal((await prisma.timeEntry.aggregate({ where: { workItemId: item.id }, _sum: { hours: true } }))._sum.hours.toString(), '1.25')
    assert.equal(await prisma.issueSyncRun.count({ where: { configId: config.id } }), 4)
    const idle = await prisma.issueSyncConfig.findUniqueOrThrow({ where: { id: config.id } })
    assert.equal(idle.leaseToken, null)
  }
  assert.equal(await prisma.workItem.count(), 2)
  console.log('Real Prisma issue sync verified for GitLab and GitHub using synthetic provider responses only')
} finally { await prisma.$disconnect() }
