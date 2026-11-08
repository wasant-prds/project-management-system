import test from 'node:test'
import assert from 'node:assert/strict'
import { loader, fixture, rawIssue, plain } from './support.mjs'
import { issueSyncSecretValues } from '../../scripts/runtime-config.mjs'
import { redact } from '../../scripts/runtime-launch.mjs'

const {
  IssueSourceClient,
  IssueSyncError,
  requiredCredential,
  isTokenEnvVar,
  parseAssignees,
  matchesAssignees,
} = loader()('lib/issue-sync-provider.ts')
const credential = (provider = 'gitlab') => ({
  tokenEnvVar: 'GITLAB_WORK_TOKEN',
  provider,
  baseUrl: fixture(provider).mapping.instanceUrl,
  token: 'synthetic-token',
})
const response = (data, status = 200, headers = {}) => new Response(JSON.stringify(data), { status, headers })

test('assignees are mandatory, normalized, deduplicated and OR matched without wildcards', () => {
  for (const value of [undefined, [], ['*'], [''], ['display name'], [123], Array(51).fill('alice')])
    assert.equal(parseAssignees(value), null)
  assert.deepEqual(plain(parseAssignees(['Alice', 'bob', 'ALICE'])), ['alice', 'bob'])
  assert.equal(matchesAssignees({ assignees: ['Bob'] }, ['alice', 'bob']), true)
  assert.equal(matchesAssignees({ assignees: [] }, ['alice']), false)
})

test('each row resolves its own token variable for multiple GitLab instances and GitHub repositories', () => {
  const env = {
    GITLAB_TEAM_A_TOKEN: 'synthetic-one',
    GITLAB_TEAM_B_TOKEN: 'synthetic-two',
    GITHUB_TOKEN_PROJECT_C: 'synthetic-three',
  }
  const first = requiredCredential('GITLAB_TEAM_A_TOKEN', 'gitlab', 'https://lab-a.test/base/', env)
  const second = requiredCredential('GITLAB_TEAM_B_TOKEN', 'gitlab', 'https://lab-b.test', env)
  const third = requiredCredential('GITHUB_TOKEN_PROJECT_C', 'github', 'https://github.com', env)
  assert.equal(first.baseUrl, 'https://lab-a.test/base')
  assert.equal(first.token, 'synthetic-one')
  assert.equal(second.token, 'synthetic-two')
  assert.equal(third.token, 'synthetic-three')
  assert.equal(
    requiredCredential('GITLAB_TEAM_A_TOKEN', 'gitlab', 'https://another-lab.test', env).token,
    first.token,
  )
  env.GITLAB_TEAM_A_TOKEN = 'synthetic-rotated'
  assert.equal(
    requiredCredential('GITLAB_TEAM_A_TOKEN', 'gitlab', first.baseUrl, env).token,
    'synthetic-rotated',
  )
})

test('token lookup rejects unrelated secrets, public variables, malformed names, unsafe hosts and unavailable tokens', () => {
  const env = { GITLAB_WORK_TOKEN: 'synthetic-value' }
  for (const name of [
    null,
    '',
    'work',
    'OWNER_GATE_PASSWORD',
    'DATABASE_URL',
    'CF_API_TOKEN',
    'NEXT_PUBLIC_GITLAB_TOKEN',
    'GITLAB_TOKEN\nX',
    'GITLAB_TOKEN;X',
    'GITLAB_' + 'A'.repeat(125) + '_TOKEN',
  ]) {
    assert.equal(isTokenEnvVar(name), false)
    assert.throws(
      () => requiredCredential(name, 'gitlab', 'https://lab.test', env),
      (error) => error.code === 'VALIDATION_ERROR',
    )
  }
  for (const [provider, url] of [
    ['github', 'https://evil.test'],
    ['gitlab', 'http://lab.test'],
    ['gitlab', 'https://user:pass@lab.test'],
    ['other', 'https://lab.test'],
  ]) {
    assert.throws(
      () => requiredCredential('GITLAB_WORK_TOKEN', provider, url, env),
      (error) => error.code === 'VALIDATION_ERROR',
    )
  }
  for (const token of [undefined, '', 'bad\nheader', '<paste-token>', 'PASTE_TOKEN_HERE']) {
    assert.throws(
      () =>
        requiredCredential('GITLAB_WORK_TOKEN', 'gitlab', 'https://lab.test', { GITLAB_WORK_TOKEN: token }),
      (error) => error.code === 'CREDENTIAL_UNAVAILABLE' && !error.message.includes('bad'),
    )
  }
})

test('launcher redacts all dedicated token variables without a credential registry or database access', () => {
  const env = {
    GITLAB_WORK_TOKEN: 'synthetic-short',
    ISSUE_SYNC_TOKEN_TEAM_B: 'synthetic-short-long',
    GITHUB_TEAM_TOKEN: 'synthetic-github-value',
  }
  assert.deepEqual(new Set(issueSyncSecretValues(env)), new Set(Object.values(env)))
  assert.equal(redact(Object.values(env).join(' '), env), '[redacted] [redacted] [redacted]')
  for (const name of Object.keys(env)) assert.equal(isTokenEnvVar(name), true)
  assert.deepEqual(
    issueSyncSecretValues({ GITLAB_EMPTY_TOKEN: '', OWNER_GATE_PASSWORD: 'separate-redaction' }),
    [],
  )
})

for (const provider of ['gitlab', 'github']) {
  test(`${provider}: parses only real issues in the configured project, with Bangkok source dates`, () => {
    const client = new IssueSourceClient(credential(provider))
    const project = { id: '42', path: fixture(provider).sourceProjectPath }
    const issue = client.parseIssue(rawIssue(provider), project)
    assert.equal(issue.id, '701')
    assert.equal(issue.status, 'todo')
    assert.equal(issue.createdAt.toISOString(), '2026-10-01T08:00:00.000Z')
    assert.equal(issue.dueDate?.toISOString(), provider === 'gitlab' ? '2026-11-04T00:00:00.000Z' : undefined)
    assert.equal(client.parseIssue(rawIssue(provider, { state: 'closed' }), project).status, 'completed')
    assert.throws(
      () =>
        client.parseIssue(
          rawIssue(
            provider,
            provider === 'github' ? { html_url: 'https://evil.test/issues/17' } : { project_id: 43 },
          ),
          project,
        ),
      IssueSyncError,
    )
    assert.throws(() => client.parseIssue(rawIssue(provider, { assignees: [null] }), project), IssueSyncError)
    if (provider === 'github')
      assert.equal(client.parseIssue(rawIssue(provider, { pull_request: {} }), project), null)
  })

  test(`${provider}: queries each assignee separately, unions pages, and rechecks credentials on every GET`, async () => {
    const calls = []
    const client = new IssueSourceClient(credential(provider), async (value, options) => {
      const url = new URL(value)
      calls.push({ url, options })
      const name = url.searchParams.get(provider === 'github' ? 'assignee' : 'assignee_username[]')
      return response(
        name === 'alice' ? [rawIssue(provider)] : [rawIssue(provider), rawIssue(provider, { id: 702 })],
      )
    })
    const issues = []
    for await (const issue of client.issues({ id: '42', path: fixture(provider).sourceProjectPath }, [
      'alice',
      'bob',
    ]))
      issues.push(issue)
    assert.equal(issues.length, 2)
    assert.equal(calls.length, 2)
    for (const { url, options } of calls) {
      assert.equal(url.searchParams.get('state'), 'all')
      assert.equal(options.redirect, 'manual')
      assert.equal(options.method, 'GET')
      assert.equal(options.cache, 'no-store')
    }
    assert.equal(
      calls[0].options.headers[provider === 'github' ? 'Authorization' : 'PRIVATE-TOKEN'],
      provider === 'github' ? 'Bearer synthetic-token' : 'synthetic-token',
    )
  })
}

test('pagination is generated locally, ignores malicious Link headers, and deduplicates source IDs', async () => {
  const calls = []
  const client = new IssueSourceClient(credential(), async (value) => {
    const url = new URL(value)
    calls.push(url)
    return response(
      url.searchParams.get('page') === '1'
        ? Array.from({ length: 100 }, (_, index) => rawIssue('gitlab', { id: index + 1 }))
        : [rawIssue('gitlab', { id: 100 }), rawIssue('gitlab', { id: 101 })],
      200,
      { Link: '<https://evil.test/steal>; rel="next"' },
    )
  })
  const issues = []
  for await (const issue of client.issues({ id: '42', path: 'group/project' }, ['alice'])) issues.push(issue)
  assert.equal(issues.length, 101)
  assert.equal(calls.length, 2)
  assert.ok(calls.every((url) => url.origin === 'https://gitlab.example.test'))
})

test('rate-limit Retry-After is honored without retrying early and errors never echo provider bodies', async () => {
  let calls = 0
  const client = new IssueSourceClient(credential('github'), async () => {
    calls++
    return response({ message: 'secret-provider-body' }, 403, {
      'retry-after': '60',
      'x-ratelimit-remaining': '0',
    })
  })
  await assert.rejects(
    client.request(client.endpoint('/repos/acme/repo')),
    (error) => error.code === 'RATE_LIMITED' && !error.message.includes('secret-provider-body'),
  )
  assert.equal(calls, 1)
})

test('short rate limits and transient failures retry with bounded delays', async () => {
  const waits = []
  let calls = 0
  const client = new IssueSourceClient(
    credential(),
    async () => (++calls < 3 ? response({}, 429, { 'retry-after': '0.01' }) : response([])),
    async (ms) => waits.push(ms),
  )
  await client.request(client.endpoint('/projects/42/issues'))
  assert.deepEqual(waits, [10, 10])
  assert.equal(calls, 3)
})

test('redirects and off-instance requests never forward tokens', async () => {
  let calls = 0
  const client = new IssueSourceClient(credential(), async () => {
    calls++
    return response({}, 302, { location: 'https://evil.test' })
  })
  await assert.rejects(client.request('https://evil.test/steal'), (error) => error.code === 'UNSAFE_SOURCE')
  assert.equal(calls, 0)
  await assert.rejects(client.request(client.endpoint('/projects/42/issues')))
  assert.equal(calls, 1)
})

test('invalid dates and unsafe numeric source IDs fail closed', async () => {
  const client = new IssueSourceClient(
    credential(),
    async () => new Response('[{"id":9007199254740993123,"iid":17,"project_id":42}]'),
  )
  const { data } = await client.request(client.endpoint('/projects/42/issues'))
  assert.equal(data[0].id, '9007199254740993123')
  assert.throws(() =>
    client.parseIssue(rawIssue('gitlab', { due_date: '2026-02-30' }), { id: '42', path: 'group/project' }),
  )
})
