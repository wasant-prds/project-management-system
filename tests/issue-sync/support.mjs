import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'

const require = createRequire(import.meta.url)
const ts = require('typescript')
export const ROOT = fileURLToPath(new URL('../..', import.meta.url))
export const uuid = (number) => `10000000-0000-4000-8000-${String(number).padStart(12, '0')}`
export const plain = (value) => JSON.parse(JSON.stringify(value))

export function loader(mocks = {}, globals = {}) {
  const cache = new Map()
  function load(path) {
    path = resolve(ROOT, path)
    if (cache.has(path)) return cache.get(path).exports
    const output = ts.transpileModule(readFileSync(path, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
    const loadedModule = { exports: {} }
    cache.set(path, loadedModule)
    vm.runInNewContext(output, { module: loadedModule, exports: loadedModule.exports,
      require(name) {
        if (Object.hasOwn(mocks, name)) return mocks[name]
        if (name.startsWith('@/')) return load(`${name.slice(2)}.ts`)
        return require(name)
      }, Date, Intl, URL, URLSearchParams, Buffer, AbortController, Response, Headers, setTimeout, clearTimeout, process,
      console: { error() {} }, fetch: async () => { throw new Error('Unexpected real network request') }, ...globals,
    }, { filename: path })
    return loadedModule.exports
  }
  return load
}

export function fixture(provider = 'gitlab') {
  const sourceProjectPath = provider === 'github' ? 'acme/repo' : 'group/project'
  return {
    id: 50n, publicId: uuid(50), mappingId: 40n, sourceProjectPath, assignees: ['alice', 'bob'], tokenEnvVar: 'GITLAB_WORK_TOKEN', enabled: true,
    revision: 0, leaseUntil: null, leaseToken: null, createdAt: new Date('2026-10-01T12:00:00Z'), updatedAt: new Date('2026-10-01T12:00:00Z'),
    mapping: { id: 40n, publicId: uuid(40), provider, canonicalGitLabInstanceUrl: provider === 'github' ? 'https://github.com' : 'https://gitlab.example.test/base',
      gitLabProjectId: '42', projectId: 20n, approvedLabelMap: { bug: 'bug' }, firstSyncApprovedAt: new Date('2026-10-01T12:00:00Z'),
      createdAt: new Date('2026-10-01T12:00:00Z'), updatedAt: new Date('2026-10-01T12:00:00Z') },
  }
}

export function rawIssue(provider = 'gitlab', overrides = {}) {
  const common = { id: 701, title: 'Fix login', state: provider === 'github' ? 'open' : 'opened', created_at: '2026-10-01T01:00:00Z', updated_at: '2026-10-02T01:00:00Z' }
  return provider === 'github' ? { ...common, number: 17, body: 'Details', labels: [{ name: 'bug' }], assignees: [{ login: 'Alice' }], html_url: 'https://github.com/acme/repo/issues/17', ...overrides }
    : { ...common, iid: 17, project_id: 42, description: 'Details', labels: ['bug'], assignees: [{ username: 'alice' }], due_date: '2026-11-04', web_url: 'https://gitlab.example.test/base/group/project/-/issues/17', ...overrides }
}

export function database(config = fixture()) {
  let state = { config: structuredClone(config), items: [], references: [], runs: [], next: 100n }
  const timestamp = () => new Date(Date.now() + 7 * 3600_000)
  const newRow = (draft, data) => { const id = draft.next++; return { id, publicId: uuid(id), createdAt: timestamp(), updatedAt: timestamp(), ...data } }
  function methods(draft) {
    return {
      issueSyncConfig: {
        async findUnique() { return structuredClone(draft.config) },
        async findUniqueOrThrow() { return structuredClone(draft.config) },
        async updateMany({ where, data }) {
          if (where.revision !== undefined && where.revision !== draft.config.revision || where.enabled && !draft.config.enabled
            || where.leaseToken && where.leaseToken !== draft.config.leaseToken
            || where.OR && draft.config.leaseUntil && draft.config.leaseUntil > timestamp()) return { count: 0 }
          Object.assign(draft.config, data); return { count: 1 }
        },
        async update({ data }) { Object.assign(draft.config, data); return structuredClone(draft.config) },
      },
      gitLabProjectMapping: {
        async findUniqueOrThrow() { return structuredClone(draft.config.mapping) },
        async update({ data }) { Object.assign(draft.config.mapping, data, { updatedAt: timestamp() }); return structuredClone(draft.config.mapping) },
      },
      issueSyncRun: {
        async findUniqueOrThrow({ where }) { const run = draft.runs.find((row) => row.id === where.id); if (!run) throw new Error('missing run'); return structuredClone(run) },
        async create({ data }) { const run = newRow(draft, { status: 'running', createdCount: 0, updatedCount: 0, skippedCount: 0, failedCount: 0, results: [], runError: null, finishedAt: null, ...data }); draft.runs.push(run); return structuredClone(run) },
        async updateMany({ data }) { const rows = draft.runs.filter((run) => run.status === 'running'); for (const run of rows) Object.assign(run, data); return { count: rows.length } },
        async update({ where, data }) { const run = draft.runs.find((run) => run.id === where.id); if (!run) throw new Error('missing run'); Object.assign(run, data); return structuredClone(run) },
      },
      externalWorkItemReference: {
        async findUnique({ where }) { const identity = Object.values(where)[0]; const ref = draft.references.find((ref) => Object.entries(identity).every(([key, value]) => ref[key] === value)); return ref ? { ...structuredClone(ref), workItem: structuredClone(draft.items.find((item) => item.id === ref.workItemId)) } : null },
        async findMany() { return structuredClone(draft.references) },
        async create({ data }) { const row = newRow(draft, data); draft.references.push(row); return structuredClone(row) },
        async update({ where, data }) { const ref = draft.references.find((row) => row.id === where.id); Object.assign(ref, data); return structuredClone(ref) },
      },
      workItem: {
        async create({ data }) { const item = newRow(draft, { submittedAt: null, dueDate: null, ...data }); draft.items.push(item); return structuredClone(item) },
        async update({ where, data }) { const item = draft.items.find((item) => item.id === where.id); Object.assign(item, data); return structuredClone(item) },
      },
    }
  }
  const db = new Proxy({}, { get(_target, key) {
    if (key === '$transaction') return async (callback) => { const draft = structuredClone(state); const result = await callback(methods(draft)); state = draft; return result }
    return methods(state)[key]
  } })
  return { db, get state() { return state }, mutate(callback) { callback(state) } }
}
