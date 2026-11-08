import { moduleLoader } from '../support/module-loader.mjs'
export { ROOT } from '../support/module-loader.mjs'
export const uuid = (number) => `10000000-0000-4000-8000-${String(number).padStart(12, '0')}`
export const plain = (value) => JSON.parse(JSON.stringify(value))
export const loader = moduleLoader

export function fixture(provider = 'gitlab') {
  const sourceProjectPath = provider === 'github' ? 'acme/repo' : 'group/project'
  return {
    id: 50n,
    publicId: uuid(50),
    mappingId: 40n,
    sourceProjectPath,
    assignees: ['alice', 'bob'],
    tokenEnvVar: 'GITLAB_WORK_TOKEN',
    enabled: true,
    revision: 0,
    leaseUntil: null,
    leaseToken: null,
    createdAt: new Date('2026-10-01T12:00:00Z'),
    updatedAt: new Date('2026-10-01T12:00:00Z'),
    mapping: {
      id: 40n,
      publicId: uuid(40),
      provider,
      instanceUrl: provider === 'github' ? 'https://github.com' : 'https://gitlab.example.test/base',
      externalProjectId: '42',
      projectId: 20n,
      approvedLabelMap: { bug: 'bug' },
      firstSyncApprovedAt: new Date('2026-10-01T12:00:00Z'),
      createdAt: new Date('2026-10-01T12:00:00Z'),
      updatedAt: new Date('2026-10-01T12:00:00Z'),
    },
  }
}

export function rawIssue(provider = 'gitlab', overrides = {}) {
  const common = {
    id: 701,
    title: 'Fix login',
    state: provider === 'github' ? 'open' : 'opened',
    created_at: '2026-10-01T01:00:00Z',
    updated_at: '2026-10-02T01:00:00Z',
  }
  return provider === 'github'
    ? {
        ...common,
        number: 17,
        body: 'Details',
        labels: [{ name: 'bug' }],
        assignees: [{ login: 'Alice' }],
        html_url: 'https://github.com/acme/repo/issues/17',
        ...overrides,
      }
    : {
        ...common,
        iid: 17,
        project_id: 42,
        description: 'Details',
        labels: ['bug'],
        assignees: [{ username: 'alice' }],
        due_date: '2026-11-04',
        web_url: 'https://gitlab.example.test/base/group/project/-/issues/17',
        ...overrides,
      }
}

export const repositoryMocks = {
  '@/lib/database/repositories/issue-sync': Object.fromEntries(
    ['syncConfigs', 'syncRuns', 'mappings', 'sourceReferences'].map((repo) => [
      repo,
      new Proxy(
        {},
        {
          get:
            (_target, method) =>
            (...args) => {
              const connection = args.pop()
              return connection.repositories[repo][method](...args)
            },
        },
      ),
    ]),
  ),
  '@/lib/database/repositories/work-items': {
    workItems: new Proxy(
      {},
      {
        get:
          (_target, method) =>
          (...args) => {
            const connection = args.pop()
            return connection.repositories.workItems[method](...args)
          },
      },
    ),
  },
}
export function database(config = fixture()) {
  let state = { config: structuredClone(config), items: [], references: [], runs: [], next: 100n }
  const timestamp = () => new Date(Date.now() + 7 * 3600_000)
  const newRow = (draft, data) => {
    const id = draft.next++
    return { id, publicId: uuid(id), createdAt: timestamp(), updatedAt: timestamp(), ...data }
  }
  function connection(draft) {
    const copy = (value) => structuredClone(value)
    return {
      repositories: {
        syncConfigs: {
          byId: async () => copy(draft.config),
          update: async (_id, data) => {
            Object.assign(draft.config, data)
            return copy(draft.config)
          },
          acquireLease: async (_id, revision, now, until) => {
            if (
              revision !== draft.config.revision ||
              !draft.config.enabled ||
              (draft.config.leaseUntil && draft.config.leaseUntil > now)
            )
              return 0
            draft.config.leaseUntil = until
            return 1
          },
          releaseLease: async (_id, token) => {
            if (draft.config.leaseToken !== token) return 0
            Object.assign(draft.config, { leaseToken: null, leaseUntil: null })
            return 1
          },
        },
        mappings: {
          byId: async () => copy(draft.config.mapping),
          update: async (_id, data) => {
            Object.assign(draft.config.mapping, data, { updatedAt: timestamp() })
            return copy(draft.config.mapping)
          },
        },
        syncRuns: {
          byId: async (id) => copy(draft.runs.find((run) => run.id === id) ?? null),
          create: async (data) => {
            const run = newRow(draft, {
              status: 'running',
              createdCount: 0,
              updatedCount: 0,
              skippedCount: 0,
              failedCount: 0,
              results: [],
              runError: null,
              finishedAt: null,
              ...data,
            })
            draft.runs.push(run)
            return copy(run)
          },
          interrupt: async (_config, now) => {
            for (const run of draft.runs.filter((run) => run.status === 'running'))
              Object.assign(run, { status: 'failed', finishedAt: now, runError: { code: 'INTERRUPTED' } })
          },
          update: async (id, data) => {
            const run = draft.runs.find((run) => run.id === id)
            if (!run) throw new Error('missing run')
            Object.assign(run, data)
            return copy(run)
          },
        },
        sourceReferences: {
          byIdentity: async (scope, issueId) => {
            const ref = draft.references.find(
              (ref) =>
                ref.externalIssueId === issueId &&
                Object.entries(scope).every(([key, value]) => ref[key] === value),
            )
            return ref
              ? { ...copy(ref), workItem: copy(draft.items.find((item) => item.id === ref.workItemId)) }
              : null
          },
          list: async () => copy(draft.references),
          create: async (data) => {
            const row = newRow(draft, data)
            draft.references.push(row)
            return copy(row)
          },
          update: async (id, data) => {
            const ref = draft.references.find((row) => row.id === id)
            Object.assign(ref, data)
            return copy(ref)
          },
        },
        workItems: {
          create: async (data) => {
            const item = newRow(draft, { submittedAt: null, dueDate: null, ...data })
            draft.items.push(item)
            return copy(item)
          },
          update: async (id, data) => {
            const item = draft.items.find((item) => item.id === id)
            Object.assign(item, data)
            return copy(item)
          },
        },
      },
    }
  }
  const db = new Proxy(
    {},
    {
      get(_target, key) {
        if (key === 'transaction')
          return async (callback) => {
            const draft = structuredClone(state)
            const result = await callback(connection(draft))
            state = draft
            return result
          }
        return connection(state)[key]
      },
    },
  )
  return {
    db,
    get state() {
      return state
    },
    mutate(callback) {
      callback(state)
    },
  }
}
