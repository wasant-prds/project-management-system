import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { loader, fixture, rawIssue, plain } from './support.mjs'
import { issueSyncSecretValues } from '../../scripts/runtime-config.mjs'
import { redact } from '../../scripts/runtime-launch.mjs'

const { IssueSourceClient, IssueSyncError, syncCredentials, parseAssignees, matchesAssignees } = loader()('lib/issue-sync-provider.ts')
const credential = (provider = 'gitlab') => ({ ref: 'work', provider, baseUrl: fixture(provider).mapping.canonicalGitLabInstanceUrl, token: 'synthetic-token' })
const response = (data, status = 200, headers = {}) => new Response(JSON.stringify(data), { status, headers })

test('assignees are mandatory, normalized, deduplicated and OR matched without wildcards', () => {
  for (const value of [undefined, [], ['*'], [''], ['display name'], [123], Array(51).fill('alice')]) assert.equal(parseAssignees(value), null)
  assert.deepEqual(plain(parseAssignees(['Alice', 'bob', 'ALICE'])), ['alice', 'bob'])
  assert.equal(matchesAssignees({ assignees: ['Bob'] }, ['alice', 'bob']), true)
  assert.equal(matchesAssignees({ assignees: [] }, ['alice']), false)
})

test('server registry resolves multiple environment secrets and exposes only registered hosts', () => {
  const env = { WORK_GL: 'secret-one', WORK_GH: 'secret-two', ISSUE_SYNC_CREDENTIALS: JSON.stringify({ lab: { provider: 'gitlab', baseUrl: 'https://lab.test/base/', tokenEnv: 'WORK_GL' }, hub: { provider: 'github', baseUrl: 'https://github.com', tokenEnv: 'WORK_GH' } }) }
  const entries = syncCredentials(env)
  assert.equal(entries.length, 2)
  assert.equal(entries[0].baseUrl, 'https://lab.test/base')
  assert.equal(entries[1].token, 'secret-two')
  for (const bad of [{ provider: 'github', baseUrl: 'https://evil.test', tokenEnv: 'WORK_GL' }, { provider: 'gitlab', baseUrl: 'http://lab.test', tokenEnv: 'WORK_GL' }, { provider: 'gitlab', baseUrl: 'https://lab.test', tokenEnv: 'NEXT_PUBLIC_TOKEN' }]) assert.equal(syncCredentials({ ...env, ISSUE_SYNC_CREDENTIALS: JSON.stringify({ bad }) }).length, 0)
  assert.equal(syncCredentials({ ISSUE_SYNC_CREDENTIALS: 'broken' }).length, 0)
})

test('registry can reference a mounted Docker secret without storing its value in config', () => {
  const directory = mkdtempSync(join(tmpdir(), 'pms-sync-secret-'))
  try {
    const file = join(directory, 'token'); writeFileSync(file, 'synthetic-file-token\n')
    const entries = syncCredentials({ WORK_TOKEN_FILE: file, ISSUE_SYNC_CREDENTIALS: JSON.stringify({ work: { provider: 'gitlab', baseUrl: 'https://lab.test', tokenFileEnv: 'WORK_TOKEN_FILE' } }) })
    assert.equal(entries[0].token, 'synthetic-file-token')
  } finally { rmSync(directory, { recursive: true }) }
})

test('launcher validates and redacts custom registry secrets without printing their values', () => {
  const env = { CUSTOM_SYNC_TOKEN: 'synthetic-custom-value', ISSUE_SYNC_CREDENTIALS: JSON.stringify({ work: { provider: 'github', baseUrl: 'https://github.com', tokenEnv: 'CUSTOM_SYNC_TOKEN' } }) }
  assert.deepEqual(issueSyncSecretValues(env), ['synthetic-custom-value'])
  assert.equal(redact('error synthetic-custom-value', env), 'error [redacted]')
  assert.throws(() => issueSyncSecretValues({ ...env, CUSTOM_SYNC_TOKEN: 'bad\nheader' }), (error) => !error.message.includes('bad'))
  assert.throws(() => issueSyncSecretValues({ ISSUE_SYNC_CREDENTIALS: '{invalid' }), /Invalid issue sync/)
})

for (const provider of ['gitlab', 'github']) {
  test(`${provider}: parses only real issues in the configured project, with Bangkok source dates`, () => {
    const client = new IssueSourceClient(credential(provider))
    const project = { id: '42', path: fixture(provider).sourceProjectPath }
    const issue = client.parseIssue(rawIssue(provider), project)
    assert.equal(issue.id, '701'); assert.equal(issue.status, 'todo'); assert.equal(issue.createdAt.toISOString(), '2026-10-01T08:00:00.000Z')
    assert.equal(issue.dueDate?.toISOString(), provider === 'gitlab' ? '2026-11-04T00:00:00.000Z' : undefined)
    assert.equal(client.parseIssue(rawIssue(provider, { state: 'closed' }), project).status, 'completed')
    assert.throws(() => client.parseIssue(rawIssue(provider, provider === 'github' ? { html_url: 'https://evil.test/issues/17' } : { project_id: 43 }), project), IssueSyncError)
    assert.throws(() => client.parseIssue(rawIssue(provider, { assignees: [null] }), project), IssueSyncError)
    if (provider === 'github') assert.equal(client.parseIssue(rawIssue(provider, { pull_request: {} }), project), null)
  })

  test(`${provider}: queries each assignee separately, unions pages, and rechecks credentials on every GET`, async () => {
    const calls = []
    const client = new IssueSourceClient(credential(provider), async (value, options) => {
      const url = new URL(value); calls.push({ url, options })
      const name = url.searchParams.get(provider === 'github' ? 'assignee' : 'assignee_username[]')
      return response(name === 'alice' ? [rawIssue(provider)] : [rawIssue(provider), rawIssue(provider, { id: 702 })])
    })
    const issues = []
    for await (const issue of client.issues({ id: '42', path: fixture(provider).sourceProjectPath }, ['alice', 'bob'])) issues.push(issue)
    assert.equal(issues.length, 2); assert.equal(calls.length, 2)
    for (const { url, options } of calls) { assert.equal(url.searchParams.get('state'), 'all'); assert.equal(options.redirect, 'manual'); assert.equal(options.method, 'GET'); assert.equal(options.cache, 'no-store') }
    assert.equal(calls[0].options.headers[provider === 'github' ? 'Authorization' : 'PRIVATE-TOKEN'], provider === 'github' ? 'Bearer synthetic-token' : 'synthetic-token')
  })
}

test('pagination is generated locally, ignores malicious Link headers, and deduplicates source IDs', async () => {
  const calls = []
  const client = new IssueSourceClient(credential(), async (value) => {
    const url = new URL(value); calls.push(url)
    return response(url.searchParams.get('page') === '1' ? Array.from({ length: 100 }, (_, index) => rawIssue('gitlab', { id: index + 1 })) : [rawIssue('gitlab', { id: 100 }), rawIssue('gitlab', { id: 101 })], 200, { Link: '<https://evil.test/steal>; rel="next"' })
  })
  const issues = []; for await (const issue of client.issues({ id: '42', path: 'group/project' }, ['alice'])) issues.push(issue)
  assert.equal(issues.length, 101); assert.equal(calls.length, 2); assert.ok(calls.every((url) => url.origin === 'https://gitlab.example.test'))
})

test('rate-limit Retry-After is honored without retrying early and errors never echo provider bodies', async () => {
  let calls = 0
  const client = new IssueSourceClient(credential('github'), async () => { calls++; return response({ message: 'secret-provider-body' }, 403, { 'retry-after': '60', 'x-ratelimit-remaining': '0' }) })
  await assert.rejects(client.request(client.endpoint('/repos/acme/repo')), (error) => error.code === 'RATE_LIMITED' && !error.message.includes('secret-provider-body'))
  assert.equal(calls, 1)
})

test('short rate limits and transient failures retry with bounded delays', async () => {
  const waits = []; let calls = 0
  const client = new IssueSourceClient(credential(), async () => ++calls < 3 ? response({}, 429, { 'retry-after': '0.01' }) : response([]), async (ms) => waits.push(ms))
  await client.request(client.endpoint('/projects/42/issues'))
  assert.deepEqual(waits, [10, 10]); assert.equal(calls, 3)
})

test('redirects and off-instance requests never forward tokens', async () => {
  let calls = 0
  const client = new IssueSourceClient(credential(), async () => { calls++; return response({}, 302, { location: 'https://evil.test' }) })
  await assert.rejects(client.request('https://evil.test/steal'), (error) => error.code === 'UNSAFE_SOURCE')
  assert.equal(calls, 0)
  await assert.rejects(client.request(client.endpoint('/projects/42/issues')))
  assert.equal(calls, 1)
})

test('invalid dates and unsafe numeric source IDs fail closed', async () => {
  const client = new IssueSourceClient(credential(), async () => new Response('[{"id":9007199254740993123,"iid":17,"project_id":42}]'))
  const { data } = await client.request(client.endpoint('/projects/42/issues'))
  assert.equal(data[0].id, '9007199254740993123')
  assert.throws(() => client.parseIssue(rawIssue('gitlab', { due_date: '2026-02-30' }), { id: '42', path: 'group/project' }))
})
