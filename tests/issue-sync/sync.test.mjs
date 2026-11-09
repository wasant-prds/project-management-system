import test from 'node:test'
import assert from 'node:assert/strict'
import { loader, fixture, rawIssue, database, uuid, repositoryMocks } from './support.mjs'

const load = loader(repositoryMocks)
const { IssueSourceClient, IssueSyncError } = load('lib/issue-sync-provider.ts')
const { executeIssueSync, startIssueSync, confirmIssueSync, syncConfigDto, syncRunDto } =
  load('lib/issue-sync.ts')
const owner = 10n

test('GitLab project sync uses a supported Issues API sort and keeps username filtering', async () => {
  const fx = database()
  const config = structuredClone(fx.state.config)
  const requests = []
  const client = new IssueSourceClient(
    {
      tokenEnvVar: config.tokenEnvVar,
      provider: 'gitlab',
      baseUrl: config.mapping.instanceUrl,
      token: 'synthetic-secret',
    },
    async (url) => {
      const target = new URL(url)
      requests.push(target)
      if (!target.pathname.endsWith('/issues'))
        return new Response(JSON.stringify({ id: 42, path_with_namespace: config.sourceProjectPath }))
      if (target.searchParams.get('order_by') !== 'created_at')
        return new Response('{"message":"order_by is invalid"}', { status: 400 })
      assert.equal(target.searchParams.get('scope'), 'all')
      assert.ok(config.assignees.includes(target.searchParams.get('assignee_username[]')))
      return new Response(JSON.stringify([rawIssue()]))
    },
  )
  const result = await executeIssueSync(
    fx.db,
    config,
    await startIssueSync(fx.db, config, false),
    owner,
    client,
  )
  assert.equal(result.status, 'success')
  assert.equal(result.createdCount, 1)
  assert.equal(fx.state.items.length, 1)
  assert.equal(requests.length, 3)
})

test('run history persists provider HTTP status and phase without response bodies, URLs or tokens', async () => {
  const fx = database()
  const config = structuredClone(fx.state.config)
  const client = new IssueSourceClient(
    {
      tokenEnvVar: config.tokenEnvVar,
      provider: 'gitlab',
      baseUrl: config.mapping.instanceUrl,
      token: 'synthetic-secret',
    },
    async (url) =>
      new URL(url).pathname.endsWith('/issues')
        ? new Response('sensitive response body synthetic-secret', { status: 403 })
        : new Response(JSON.stringify({ id: 42, path_with_namespace: config.sourceProjectPath })),
  )
  const result = await executeIssueSync(
    fx.db,
    config,
    await startIssueSync(fx.db, config, false),
    owner,
    client,
  )
  assert.equal(result.status, 'failed')
  assert.equal(result.runError.code, 'PROVIDER_FORBIDDEN')
  assert.deepEqual(result.runError.providerFailure, {
    provider: 'gitlab',
    operation: 'list_issues',
    httpStatus: 403,
  })
  assert.ok(result.runError.message.includes('read_api'))
  assert.ok(result.runError.message.includes(config.tokenEnvVar))
  assert.doesNotMatch(JSON.stringify(syncRunDto(result)), /synthetic-secret|sensitive response|\/api\/v4/)
  assert.equal(fx.state.items.length, 0)
  assert.equal(fx.state.config.leaseToken, null)
})

function sourceClient(config, rows, { absent = [], error, resolvedId = '42' } = {}) {
  const client = new IssueSourceClient({
    tokenEnvVar: config.tokenEnvVar,
    provider: config.mapping.provider,
    baseUrl: config.mapping.instanceUrl,
    token: 'synthetic-secret',
  })
  client.resolveProject = async () => ({ id: resolvedId, path: config.sourceProjectPath })
  client.issues = async function* () {
    for (const row of rows) yield row
    if (error) throw error
  }
  client.issue = async (_source, number) => {
    const issue = absent.find((row) => String(row.iid ?? row.number) === number)
    if (!issue) throw new IssueSyncError('PROVIDER_UNAVAILABLE', 'ตรวจ issue เดิมไม่ได้', 503, true)
    return issue
  }
  return client
}
async function sync(fx, rows, options = {}) {
  const config = structuredClone(fx.state.config)
  const run = await startIssueSync(fx.db, config, options.approve ?? false)
  return executeIssueSync(fx.db, config, run, owner, sourceClient(config, rows, options))
}

function legacyItem(state, overrides = {}) {
  const id = state.next++
  const item = {
    id,
    publicId: uuid(id),
    title: 'Fix login',
    description: null,
    kind: 'Task',
    priority: 'high',
    role: 'SA',
    status: 'todo',
    types: null,
    workDate: null,
    dueDate: null,
    submittedAt: null,
    projectId: 20n,
    assigneeId: owner,
    dailyWork: [{ hours: '2.00' }],
    ...overrides,
  }
  state.items.push(item)
  return item
}

for (const provider of ['gitlab', 'github']) {
  test(`${provider}: repair and link an incomplete unlinked item, then update the same UUID after source rename`, async () => {
    const fx = database(fixture(provider))
    fx.mutate((state) => legacyItem(state))
    const id = fx.state.items[0].publicId
    const linked = await sync(fx, [rawIssue(provider)])
    assert.equal(linked.results[0].outcome, 'pending')
    assert.equal(linked.createdCount, 0)
    const confirmed = await confirmIssueSync(
      fx.db,
      structuredClone(fx.state.config),
      linked.publicId,
      owner,
      [{ issueId: '701', workItemId: id }],
    )
    assert.equal(confirmed.updatedCount, 1)
    assert.equal(confirmed.results[0].reason, 'linked_existing_work_item')
    assert.equal(fx.state.items[0].title, '[#17] [SA] Fix login')
    assert.equal(fx.state.items[0].description, 'Details')
    const unchanged = await sync(fx, [rawIssue(provider)])
    assert.equal(unchanged.skippedCount, 1)
    await sync(fx, [rawIssue(provider, { title: 'Renamed', updated_at: '2026-10-04T01:00:00Z' })])
    assert.equal(fx.state.items.length, 1)
    assert.equal(fx.state.references.length, 1)
    assert.equal(fx.state.items[0].publicId, id)
    assert.equal(fx.state.items[0].title, '[#17] [SA] Renamed')
    assert.deepEqual(fx.state.items[0].dailyWork, [{ hours: '2.00' }])
  })

  test(`${provider}: repair existing mapping at equal source timestamp and refresh all source label fields`, async () => {
    const fx = database(fixture(provider))
    await sync(fx, [rawIssue(provider)])
    const id = fx.state.items[0].publicId
    fx.mutate((state) =>
      Object.assign(state.items[0], { title: 'Fix login', description: null, types: null }),
    )
    const labels = [
      'type::task',
      'type::documentation',
      'priority::high',
      'role::SA',
      'status::completed',
      'team::sales',
    ]
    const row = rawIssue(provider, {
      labels: provider === 'github' ? labels.map((name) => ({ name })) : labels,
    })
    assert.equal((await sync(fx, [row])).updatedCount, 1)
    const item = fx.state.items[0]
    assert.equal(item.publicId, id)
    assert.equal(item.title, '[#17] [SA] Fix login')
    assert.equal(item.kind, 'Task')
    assert.equal(item.priority, 'high')
    assert.equal(item.role, 'SA')
    assert.equal(item.status, 'completed')
    assert.ok(item.submittedAt)
    assert.deepEqual(item.types, ['documentation', 'team::sales'])
    assert.equal((await sync(fx, [row])).skippedCount, 1)
    fx.mutate((state) => {
      state.items[0].submittedAt = null
    })
    assert.equal((await sync(fx, [row])).updatedCount, 1)
    assert.ok(fx.state.items[0].submittedAt)
    await sync(fx, [rawIssue(provider, { labels: [] })])
    assert.deepEqual(fx.state.items[0].types, [])
    assert.equal(fx.state.items.length, 1)
  })
}

test('ambiguous local content waits for confirmation without creating or linking a third work item', async () => {
  const fx = database()
  fx.mutate((state) => {
    legacyItem(state)
    legacyItem(state)
  })
  const run = await sync(fx, [rawIssue()])
  assert.equal(run.results[0].reason, 'confirmation_required')
  assert.equal(run.results[0].candidates.length, 2)
  assert.equal(fx.state.items.length, 2)
  assert.equal(fx.state.references.length, 0)
})

for (const provider of ['gitlab', 'github']) {
  test(`${provider}: titles over 60% wait without writes, different choice creates once and never asks again`, async () => {
    const fx = database(fixture(provider))
    fx.mutate((state) => legacyItem(state, { title: 'Fix login page' }))
    const run = await sync(fx, [rawIssue(provider)])
    assert.equal(run.status, 'partial')
    assert.equal(run.results[0].outcome, 'pending')
    assert.ok(run.results[0].candidates[0].similarity > 0.6)
    assert.equal(fx.state.items.length, 1)
    assert.equal(fx.state.references.length, 0)
    const dto = syncRunDto(run)
    assert.equal(dto.counts.pending, 1)
    assert.doesNotMatch(JSON.stringify(dto), /reviewSnapshot|versions|remoteUpdatedAt|projectId|assigneeId/)
    const answers = [{ issueId: '701', workItemId: null }]
    const done = await confirmIssueSync(fx.db, structuredClone(fx.state.config), run.publicId, owner, answers)
    assert.equal(done.createdCount, 1)
    assert.equal(fx.state.items.length, 2)
    await confirmIssueSync(fx.db, structuredClone(fx.state.config), run.publicId, owner, answers)
    assert.equal(fx.state.items.length, 2)
    assert.equal((await sync(fx, [rawIssue(provider)])).skippedCount, 1)
  })
}

test('exactly 60% does not prompt; same issue numbers and explicit URLs can identify legacy rows', async () => {
  const low = database()
  low.mutate((state) => legacyItem(state, { title: 'abcdxy' }))
  assert.equal((await sync(low, [rawIssue('gitlab', { title: 'abcdef' })])).createdCount, 1)
  for (const changes of [
    { title: '[#17] Fix login' },
    { title: 'Old name', description: 'Source: https://gitlab.example.test/base/group/project/-/issues/17' },
  ]) {
    const fx = database()
    fx.mutate((state) => legacyItem(state, changes))
    const result = await sync(fx, [rawIssue()])
    assert.equal(result.updatedCount, 1)
    assert.equal(result.results[0].outcome, 'updated')
    assert.equal(fx.state.items.length, 1)
  }
})

test('a different explicit source URL skips the title alert even with identical titles', async () => {
  const fx = database()
  fx.mutate((state) =>
    legacyItem(state, { description: 'Source: https://gitlab.example.test/base/group/project/-/issues/18' }),
  )
  assert.equal((await sync(fx, [rawIssue()])).createdCount, 1)
  for (const description of ['**Issue:** #&#8203;18', '**Issue:** #18', 'Issue: #18']) {
    const other = database()
    other.mutate((state) => legacyItem(state, { description }))
    assert.equal((await sync(other, [rawIssue()])).createdCount, 1)
  }
})

test('confirmation rejects stale edits, foreign UUIDs, missing answers and config changes without writes', async () => {
  for (const change of [
    'edit',
    'new-candidate',
    'owner',
    'config',
    'foreign-choice',
    'missing-choice',
    'foreign-run',
  ]) {
    const fx = database()
    fx.mutate((state) => legacyItem(state))
    const run = await sync(fx, [rawIssue()])
    const target = fx.state.items[0].publicId
    fx.mutate((state) => {
      if (change === 'edit') state.items[0].description = 'Changed while reviewing'
      if (change === 'new-candidate') legacyItem(state)
      if (change === 'owner') state.items[0].assigneeId = 99n
      if (change === 'config') state.config.revision++
    })
    await assert.rejects(
      confirmIssueSync(
        fx.db,
        structuredClone(fx.state.config),
        change === 'foreign-run' ? uuid(999) : run.publicId,
        owner,
        change === 'missing-choice'
          ? []
          : [{ issueId: '701', workItemId: change === 'foreign-choice' ? uuid(999) : target }],
      ),
      (error) => ['REVIEW_STALE', 'VALIDATION_ERROR', 'NOT_FOUND'].includes(error.code),
    )
    assert.equal(fx.state.references.length, 0)
    assert.equal(fx.state.config.leaseToken, null)
    assert.equal(fx.state.runs[0].results[0].outcome, 'pending')
  }
})

test('one batch can link a shared candidate for one source and create a separate item for another', async () => {
  const fx = database()
  fx.mutate((state) => legacyItem(state))
  const first = rawIssue(),
    second = rawIssue('gitlab', {
      id: 702,
      iid: 18,
      web_url: 'https://gitlab.example.test/base/group/project/-/issues/18',
    })
  const run = await sync(fx, [first, second])
  const target = fx.state.items[0].publicId
  assert.equal(syncRunDto(run).counts.pending, 2)
  await assert.rejects(
    confirmIssueSync(fx.db, structuredClone(fx.state.config), run.publicId, owner, [
      { issueId: '701', workItemId: target },
      { issueId: '702', workItemId: target },
    ]),
    (error) => error.code === 'VALIDATION_ERROR',
  )
  const done = await confirmIssueSync(fx.db, structuredClone(fx.state.config), run.publicId, owner, [
    { issueId: '701', workItemId: target },
    { issueId: '702', workItemId: null },
  ])
  assert.equal(done.updatedCount, 1)
  assert.equal(done.createdCount, 1)
  assert.equal(fx.state.references.length, 2)
  assert.equal(fx.state.items.length, 2)
})

test('matching never adopts another owner, project, explicit issue number or already linked source', async () => {
  for (const overrides of [{ assigneeId: 99n }, { projectId: 99n }, { title: '[#18] Fix login' }]) {
    const fx = database()
    fx.mutate((state) => legacyItem(state, overrides))
    assert.equal((await sync(fx, [rawIssue()])).createdCount, 1)
    assert.equal(fx.state.items.length, 2)
  }
  const fx = database()
  await sync(fx, [rawIssue()])
  const run = await sync(fx, [
    rawIssue(),
    rawIssue('gitlab', {
      id: 702,
      iid: 18,
      web_url: 'https://gitlab.example.test/base/group/project/-/issues/18',
    }),
  ])
  assert.equal(run.createdCount, 1)
  assert.equal(fx.state.items.length, 2)
})

test('a different source ID claiming an existing issue number fails without duplication', async () => {
  const fx = database()
  await sync(fx, [rawIssue()])
  const run = await sync(fx, [rawIssue('gitlab', { id: 702 })], { absent: [rawIssue()] })
  assert.equal(run.results[0].reason, 'SOURCE_IDENTITY_CONFLICT')
  assert.equal(fx.state.items.length, 1)
})

test('a truly missing mapped destination is recreated using the existing source reference', async () => {
  const fx = database()
  await sync(fx, [rawIssue()])
  const referenceId = fx.state.references[0].publicId
  fx.mutate((state) => {
    state.items = []
  })
  assert.equal((await sync(fx, [rawIssue()])).createdCount, 1)
  assert.equal(fx.state.references.length, 1)
  assert.equal(fx.state.references[0].publicId, referenceId)
  assert.equal((await sync(fx, [rawIssue()])).skippedCount, 1)
})

for (const provider of ['gitlab', 'github']) {
  test(`${provider}: repeat sync preserves public IDs, owner, PMS fields, and creates durable run history`, async () => {
    const fx = database(fixture(provider))
    const first = await sync(fx, [rawIssue(provider)])
    assert.equal(first.status, 'success')
    assert.equal(first.createdCount, 1)
    assert.equal(fx.state.items.length, 1)
    assert.equal(fx.state.references.length, 1)
    const originalId = fx.state.items[0].publicId
    fx.mutate((state) =>
      Object.assign(state.items[0], {
        priority: 'urgent',
        role: 'infra',
        workDate: new Date('2026-11-03'),
        dailyWork: [{ hours: '3.25' }],
      }),
    )
    const repeated = await sync(fx, [rawIssue(provider)])
    assert.equal(repeated.updatedCount, 1) // the locally added role is reflected in the formatted title
    assert.equal(fx.state.items.length, 1)
    const updated = await sync(fx, [
      rawIssue(provider, { title: 'Changed title', state: 'closed', updated_at: '2026-10-03T02:00:00Z' }),
    ])
    assert.equal(updated.updatedCount, 1)
    const item = fx.state.items[0]
    assert.equal(item.publicId, originalId)
    assert.equal(item.status, 'completed')
    assert.equal(item.assigneeId, owner)
    assert.equal(item.priority, 'urgent')
    assert.equal(item.role, 'infra')
    assert.equal(item.workDate.toISOString().slice(0, 10), '2026-11-03')
    assert.deepEqual(item.dailyWork, [{ hours: '3.25' }])
    assert.equal(fx.state.runs.length, 3)
    assert.equal(fx.state.config.leaseToken, null)
    assert.equal(fx.state.config.leaseUntil, null)
    const dto = syncRunDto(updated)
    assert.match(dto.id, /^10000000-/)
    assert.equal(dto.startedAt.endsWith('+07:00'), true)
    const encoded = JSON.stringify(dto)
    assert.equal(encoded.includes('synthetic-secret'), false)
    assert.equal(encoded.includes('workItemId":' + String(item.id)), false)
  })

  test(`${provider}: missing and nonmatching assignees never create work items, even if the provider ignores the filter`, async () => {
    const fx = database(fixture(provider))
    const rows = [
      rawIssue(provider, { assignees: [] }),
      rawIssue(provider, {
        id: 702,
        assignees: provider === 'github' ? [{ login: 'charlie' }] : [{ username: 'charlie' }],
      }),
    ]
    const run = await sync(fx, rows)
    assert.equal(run.skippedCount, 2)
    assert.equal(run.createdCount, 0)
    assert.equal(fx.state.items.length, 0)
    assert.ok(run.results.every((result) => result.reason === 'assignee_not_matched'))
  })

  test(`${provider}: confirmed reassignment freezes source fields, records out-of-scope, and resumes using the same UUID`, async () => {
    const fx = database(fixture(provider))
    await sync(fx, [rawIssue(provider)])
    const id = fx.state.items[0].publicId
    const reassigned = rawIssue(provider, {
      title: 'Do not import this change',
      updated_at: '2026-10-04T02:00:00Z',
      assignees: [],
    })
    const run = await sync(fx, [], { absent: [reassigned] })
    assert.equal(run.results[0].reason, 'out_of_scope')
    assert.equal(fx.state.references[0].inScope, false)
    assert.equal(fx.state.items[0].title, '[#17] Fix login')
    assert.equal(fx.state.items[0].publicId, id)
    await sync(fx, [rawIssue(provider)]) // old matching snapshot cannot undo reassignment
    assert.equal(fx.state.references[0].inScope, false)
    await sync(fx, [rawIssue(provider, { title: 'Reassigned back', updated_at: '2026-10-05T02:00:00Z' })])
    assert.equal(fx.state.references[0].inScope, true)
    assert.equal(fx.state.items[0].title, '[#17] Reassigned back')
    assert.equal(fx.state.items[0].publicId, id)
  })
}

test('a missing issue or provider failure never implies out-of-scope and keeps partial committed history', async () => {
  const fx = database()
  await sync(fx, [rawIssue()])
  const failed = await sync(fx, [], { error: new IssueSyncError('RATE_LIMITED', 'จำกัดคำขอ', 503, true) })
  assert.equal(failed.status, 'failed')
  assert.equal(failed.runError.code, 'RATE_LIMITED')
  assert.equal(fx.state.references[0].inScope, true)
  const partial = await sync(
    fx,
    [
      rawIssue('gitlab', {
        id: 702,
        iid: 18,
        web_url: 'https://gitlab.example.test/base/group/project/-/issues/18',
      }),
    ],
    { error: new IssueSyncError('RATE_LIMITED', 'จำกัดคำขอ', 503, true) },
  )
  assert.equal(partial.status, 'partial')
  assert.equal(partial.createdCount, 1)
  assert.equal(fx.state.items.length, 2)
  assert.equal(fx.state.runs.at(-1).results.length, 1)
})

test('unchanged and out-of-scope items retain due dates unsupported by GitHub', async () => {
  const fx = database(fixture('github'))
  await sync(fx, [rawIssue('github')])
  fx.mutate((state) => {
    state.items[0].dueDate = new Date('2026-12-31T00:00:00Z')
  })
  await sync(fx, [rawIssue('github', { title: 'New title' })])
  assert.equal(fx.state.items[0].dueDate.toISOString(), '2026-12-31T00:00:00.000Z')
})

test('first-sync approval is required and config without assignees or disabled cannot start', async () => {
  for (const change of [{ assignees: [] }, { enabled: false }]) {
    const config = { ...fixture(), ...change }
    const fx = database(config)
    await assert.rejects(startIssueSync(fx.db, config, true), (error) => error.code === 'CONFIG_DISABLED')
    assert.equal(fx.state.runs.length, 0)
  }
  const config = fixture()
  config.mapping.firstSyncApprovedAt = null
  const fx = database(config)
  await assert.rejects(
    startIssueSync(fx.db, config, false),
    (error) => error.code === 'FIRST_SYNC_APPROVAL_REQUIRED',
  )
  const run = await sync(fx, [rawIssue()], { approve: true })
  assert.equal(run.createdCount, 1)
  assert.ok(fx.state.config.mapping.firstSyncApprovedAt)
})

test('one config cannot run concurrently and an expired lease records interruption before retry', async () => {
  const fx = database()
  const config = structuredClone(fx.state.config)
  const run = await startIssueSync(fx.db, config, false)
  await assert.rejects(startIssueSync(fx.db, config, false), (error) => error.code === 'SYNC_IN_PROGRESS')
  fx.mutate((state) => {
    state.config.leaseUntil = new Date('2020-01-01')
  })
  const retry = await startIssueSync(fx.db, structuredClone(fx.state.config), false)
  assert.notEqual(retry.publicId, run.publicId)
  assert.equal(fx.state.runs[0].status, 'failed')
  assert.equal(fx.state.runs[0].runError.code, 'INTERRUPTED')
})

test('config edits and source identity changes stop writes safely', async () => {
  const fx = database()
  const config = structuredClone(fx.state.config)
  const run = await startIssueSync(fx.db, config, false)
  fx.mutate((state) => {
    state.config.revision++
  })
  const result = await executeIssueSync(fx.db, config, run, owner, sourceClient(config, [rawIssue()]))
  assert.equal(result.runError.code, 'CONFIG_CHANGED')
  assert.equal(fx.state.items.length, 0)
  const other = database()
  const identityChanged = await sync(other, [rawIssue()], { resolvedId: '43' })
  assert.equal(identityChanged.runError.code, 'SOURCE_IDENTITY_CHANGED')
  assert.equal(other.state.items.length, 0)
})

test('direct table edits to the token variable or assignee filter stop in-flight writes without relying on API revisions', async () => {
  for (const change of [{ tokenEnvVar: 'GITLAB_OTHER_TOKEN' }, { assignees: ['charlie'] }]) {
    const fx = database()
    const config = structuredClone(fx.state.config)
    const run = await startIssueSync(fx.db, config, false)
    fx.mutate((state) => Object.assign(state.config, change))
    const result = await executeIssueSync(fx.db, config, run, owner, sourceClient(config, [rawIssue()]))
    assert.equal(result.runError.code, 'CONFIG_CHANGED')
    assert.equal(fx.state.items.length, 0)
  }
})

test('foreign owner and destination conflicts cannot modify existing work items', async () => {
  for (const change of [{ assigneeId: 99n }, { projectId: 99n }]) {
    const fx = database()
    await sync(fx, [rawIssue()])
    fx.mutate((state) => Object.assign(state.items[0], change))
    const result = await sync(fx, [rawIssue('gitlab', { title: 'Unauthorized change' })])
    assert.equal(result.failedCount, 1)
    assert.equal(result.results[0].reason, 'SOURCE_IDENTITY_CONFLICT')
    assert.equal(fx.state.items[0].title, '[#17] Fix login')
  }
})

test('an identity mismatch on known-issue lookup cannot freeze or overwrite another issue', async () => {
  const fx = database()
  await sync(fx, [rawIssue()])
  const run = await sync(fx, [], { absent: [rawIssue('gitlab', { id: 999, assignees: [] })] })
  assert.equal(run.failedCount, 1)
  assert.equal(fx.state.references[0].inScope, true)
})

test('config and run DTOs expose UUIDs and explicit safe fields without internal keys or lease tokens', () => {
  const config = fixture()
  config.leaseToken = uuid(777)
  const dto = syncConfigDto(config)
  assert.equal(dto.id, config.publicId)
  assert.equal('mappingId' in dto, false)
  assert.equal('projectId' in dto, false)
  assert.equal('leaseToken' in dto, false)
  assert.equal(JSON.stringify(dto).includes(uuid(777)), false)
})

test('an expired old process cannot overwrite interrupted history or release the replacement lease', async () => {
  const fx = database()
  const config = structuredClone(fx.state.config)
  const oldRun = await startIssueSync(fx.db, config, false)
  fx.mutate((state) => {
    state.config.leaseUntil = new Date('2020-01-01')
  })
  const replacement = await startIssueSync(fx.db, structuredClone(fx.state.config), false)
  const finishedOld = await executeIssueSync(fx.db, config, oldRun, owner, sourceClient(config, [rawIssue()]))
  assert.equal(finishedOld.status, 'failed')
  assert.equal(finishedOld.runError.code, 'INTERRUPTED')
  assert.equal(fx.state.config.leaseToken, replacement.publicId)
  assert.equal(fx.state.items.length, 0)
})
