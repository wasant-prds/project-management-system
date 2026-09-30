import type { ExternalWorkItemReference, GitLabProjectMapping, Prisma, PrismaClient } from '@prisma/client'
import { currentBangkokWallClockDate } from '@/lib/bangkok-datetime'
import { WORK_ITEM_TYPES, shouldStampSubmittedAt } from '@/lib/work-items'

export type GitLabConfiguration = { baseUrl: string; token: string }

type RawIssue = Record<string, unknown>

const GITLAB_ID_FIELDS = new Set(['id', 'iid', 'project_id'])

type GitLabIssue = {
  id: string
  iid: string
  projectId: string
  title: string
  description: string | null
  state: 'opened' | 'closed'
  labels: string[]
  dueDate: Date | null
  webUrl: string
  remoteCreatedAt: Date
  remoteUpdatedAt: Date
}

export class GitLabProviderError extends Error {
  constructor(
    readonly code: 'RATE_LIMITED' | 'PROVIDER_UNAVAILABLE',
    message: string,
    readonly retryable: boolean,
  ) {
    super(message)
  }
}

export class GitLabPaginationError extends GitLabProviderError {
  constructor(
    message: string,
    readonly issues: RawIssue[],
    readonly nextPage: string | null,
    retryable: boolean,
    code: 'RATE_LIMITED' | 'PROVIDER_UNAVAILABLE' = 'PROVIDER_UNAVAILABLE',
  ) {
    super(code, message, retryable)
  }
}

class GitLabIssueError extends Error {
  constructor(readonly code: string, message: string) {
    super(message)
  }
}

export function canonicalGitLabBaseUrl(value: unknown): string | null {
  if (typeof value !== 'string' || value.trim() === '') return null
  try {
    const url = new URL(value.trim())
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) return null
    url.pathname = url.pathname.replace(/\/+$/, '')
    return url.href.replace(/\/$/, '')
  } catch {
    return null
  }
}

export function getGitLabConfiguration(env: NodeJS.ProcessEnv = process.env): GitLabConfiguration | null {
  const baseUrl = canonicalGitLabBaseUrl(env.GITLAB_BASE_URL)
  const token = env.GITLAB_TOKEN?.trim()
  return baseUrl && token && !/[\r\n]/.test(token) ? { baseUrl, token } : null
}

function validPositiveId(value: unknown): string | null {
  const id = typeof value === 'number' && Number.isSafeInteger(value)
    ? String(value)
    : typeof value === 'string' ? value : ''
  return /^[1-9]\d*$/.test(id) ? id : null
}

function validCalendarDate(value: unknown): Date | null {
  if (value === null || value === undefined) return null
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new GitLabIssueError('INVALID_REMOTE_ISSUE', 'GitLab Issue due date is invalid')
  }
  const [year, month, day] = value.split('-').map(Number)
  const date = new Date(0)
  date.setUTCFullYear(year, month - 1, day)
  date.setUTCHours(0, 0, 0, 0)
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    throw new GitLabIssueError('INVALID_REMOTE_ISSUE', 'GitLab Issue due date is invalid')
  }
  return date
}

export function parseGitLabTimestamp(value: unknown): Date | null {
  if (typeof value !== 'string' || !/(?:Z|[+-]\d{2}:\d{2})$/i.test(value)) return null
  const instant = new Date(value)
  if (Number.isNaN(instant.getTime())) return null
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Bangkok',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    fractionalSecondDigits: 3, hourCycle: 'h23',
  }).formatToParts(instant)
  const values = Object.fromEntries(parts.map(({ type, value: part }) => [type, part]))
  const wallClock = new Date(0)
  wallClock.setUTCFullYear(Number(values.year), Number(values.month) - 1, Number(values.day))
  wallClock.setUTCHours(Number(values.hour), Number(values.minute), Number(values.second), Number(values.fractionalSecond))
  return wallClock
}

function sourceUrlMatchesInstance(sourceUrl: string, baseUrl: string, iid: string) {
  try {
    const source = new URL(sourceUrl)
    const base = new URL(baseUrl)
    const basePath = base.pathname.replace(/\/+$/, '')
    const issuePath = new RegExp(`(?:/-)?/issues/${iid}/?$`)
    return source.origin === base.origin
      && !source.username && !source.password && !source.search && !source.hash
      && (basePath === '' || source.pathname.startsWith(`${basePath}/`))
      && issuePath.test(source.pathname)
  } catch {
    return false
  }
}

function parseIssue(value: unknown, mapping: GitLabProjectMapping, baseUrl: string): GitLabIssue {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new GitLabIssueError('INVALID_REMOTE_ISSUE', 'GitLab returned an invalid Issue')
  }
  const issue = value as RawIssue
  const id = validPositiveId(issue.id)
  const iid = validPositiveId(issue.iid)
  const projectId = validPositiveId(issue.project_id)
  const createdAt = parseGitLabTimestamp(issue.created_at)
  const updatedAt = parseGitLabTimestamp(issue.updated_at)
  const webUrl = typeof issue.web_url === 'string' ? issue.web_url : ''
  if (!id || !iid || projectId !== mapping.gitLabProjectId
    || typeof issue.title !== 'string' || issue.title.trim() === '' || issue.title.length > 1000
    || (issue.description !== null && issue.description !== undefined && typeof issue.description !== 'string')
    || (issue.state !== 'opened' && issue.state !== 'closed')
    || !Array.isArray(issue.labels) || !issue.labels.every((label) => typeof label === 'string')
    || !createdAt || !updatedAt || !sourceUrlMatchesInstance(webUrl, baseUrl, iid)) {
    throw new GitLabIssueError('INVALID_REMOTE_ISSUE', 'GitLab Issue fields did not match the configured Project')
  }
  return {
    id,
    iid,
    projectId,
    title: issue.title,
    description: issue.description == null ? null : issue.description as string,
    state: issue.state,
    labels: issue.labels as string[],
    dueDate: validCalendarDate(issue.due_date),
    webUrl,
    remoteCreatedAt: createdAt,
    remoteUpdatedAt: updatedAt,
  }
}

export function validateApprovedLabelMap(value: unknown): Record<string, string> | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null
  const entries = Object.entries(value)
  if (entries.length > 100 || entries.some(([label, type]) => label.trim() === '' || label.length > 255
    || typeof type !== 'string' || !WORK_ITEM_TYPES.includes(type as (typeof WORK_ITEM_TYPES)[number]))) return null
  return Object.fromEntries(entries) as Record<string, string>
}

function retryAfterMs(value: string | null, now: number) {
  if (!value) return null
  const seconds = Number(value)
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000
  const date = Date.parse(value)
  return Number.isNaN(date) ? null : Math.max(0, date - now)
}

async function requestPage(
  url: string,
  config: GitLabConfiguration,
  fetchImpl: typeof fetch,
  wait: (ms: number) => Promise<void>,
): Promise<Response> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    let response: Response
    try {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 15_000)
      try {
        response = await fetchImpl(url, {
          method: 'GET',
          headers: { 'PRIVATE-TOKEN': config.token, Accept: 'application/json' },
          cache: 'no-store',
          redirect: 'manual',
          signal: controller.signal,
        })
      } finally {
        clearTimeout(timeout)
      }
    } catch {
      if (attempt < 2) {
        await wait(150 * (2 ** attempt))
        continue
      }
      throw new GitLabProviderError('PROVIDER_UNAVAILABLE', 'GitLab could not be reached', true)
    }

    if (response.ok) return response
    const retryable = response.status === 429 || response.status >= 500
    if (retryable && attempt < 2) {
      const requestedWait = response.status === 429
        ? retryAfterMs(response.headers.get('Retry-After'), Date.now()) ?? 250 * (attempt + 1)
        : 150 * (2 ** attempt)
      // A longer Retry-After is honored by ending this run without an early retry.
      if (requestedWait <= 2_000) {
        await wait(requestedWait)
        continue
      }
    }
    if (response.status === 429) {
      throw new GitLabProviderError('RATE_LIMITED', 'GitLab is rate limiting this sync', true)
    }
    throw new GitLabProviderError('PROVIDER_UNAVAILABLE', 'GitLab rejected the Issue request', retryable)
  }
  throw new GitLabProviderError('PROVIDER_UNAVAILABLE', 'GitLab could not complete the Issue request', true)
}

function parseGitLabJson(value: string): unknown {
  return JSON.parse(value, (key, parsed, context?: { source?: string }) => {
    if (!GITLAB_ID_FIELDS.has(key) || typeof parsed !== 'number') return parsed
    const source = context?.source
    if (source && /^[1-9]\d*$/.test(source)) return source
    if (!Number.isSafeInteger(parsed)) {
      throw new Error('GitLab returned a numeric ID that cannot be represented safely')
    }
    return parsed
  })
}

function nextLink(linkHeader: string | null) {
  if (!linkHeader) return null
  const matches = [...linkHeader.matchAll(/<([^>]+)>\s*;\s*rel=(?:"next"|next)/gi)]
  return matches[0]?.[1] ?? null
}

function validateNextPage(value: string, current: URL, projectId: string, baseUrl: string) {
  try {
    const next = new URL(value, current)
    const base = new URL(baseUrl)
    const endpoint = `${base.pathname.replace(/\/+$/, '')}/api/v4/projects/${encodeURIComponent(projectId)}/issues`
    return next.origin === base.origin && next.pathname === endpoint && !next.username && !next.password
      ? next.href
      : null
  } catch {
    return null
  }
}

async function listIssues(
  mapping: GitLabProjectMapping,
  config: GitLabConfiguration,
  fetchImpl: typeof fetch,
  wait: (ms: number) => Promise<void>,
) {
  const endpoint = new URL(`${config.baseUrl}/api/v4/projects/${encodeURIComponent(mapping.gitLabProjectId)}/issues`)
  endpoint.searchParams.set('scope', 'all')
  endpoint.searchParams.set('state', 'all')
  endpoint.searchParams.set('per_page', '100')
  endpoint.searchParams.set('page', '1')
  let pageUrl: string | null = endpoint.href
  let fallbackPage = 1
  const seenPages = new Set<string>()
  const seenIssues = new Set<string>()
  const issues: RawIssue[] = []

  while (pageUrl) {
    if (seenPages.has(pageUrl) || seenPages.size >= 1000) {
      throw new GitLabPaginationError('GitLab pagination did not complete safely', issues, pageUrl, true)
    }
    seenPages.add(pageUrl)
    let response: Response
    try {
      response = await requestPage(pageUrl, config, fetchImpl, wait)
    } catch (error) {
      if (error instanceof GitLabProviderError) {
        throw new GitLabPaginationError(error.message, issues, pageUrl, error.retryable, error.code)
      }
      throw new GitLabPaginationError('GitLab pagination failed', issues, pageUrl, true)
    }
    let page: unknown
    try {
      page = parseGitLabJson(await response.text())
    } catch {
      throw new GitLabPaginationError('GitLab returned unreadable Issue data', issues, pageUrl, true)
    }
    if (!Array.isArray(page)) {
      throw new GitLabPaginationError('GitLab returned an invalid Issue page', issues, pageUrl, false)
    }
    for (const issue of page) {
      const id = typeof issue === 'object' && issue !== null ? validPositiveId((issue as RawIssue).id) : null
      if (id && seenIssues.has(id)) continue
      if (id) seenIssues.add(id)
      issues.push(issue as RawIssue)
    }

    const linkedNext = nextLink(response.headers.get('Link'))
    if (linkedNext) {
      pageUrl = validateNextPage(linkedNext, new URL(pageUrl), mapping.gitLabProjectId, config.baseUrl)
      if (!pageUrl) throw new GitLabPaginationError('GitLab returned an unsafe pagination link', issues, null, false)
      continue
    }
    if (page.length === 0) {
      pageUrl = null
      continue
    }
    fallbackPage += 1
    const fallback = new URL(endpoint)
    fallback.searchParams.set('page', String(fallbackPage))
    pageUrl = fallback.href
  }
  return issues
}

function toPublicState(state: GitLabIssue['state']) {
  return state === 'opened' ? 'todo' : 'completed'
}

function sameTypes(left: string[], right: string[]) {
  return left.length === right.length && left.every((type, index) => type === right[index])
}

function issueOutcome(issue: GitLabIssue, outcome: string, workItemId: string | null, extra: Record<string, unknown> = {}) {
  return {
    outcome,
    issueId: issue.id,
    iid: issue.iid,
    title: issue.title,
    sourceUrl: issue.webUrl,
    workItemId,
    ...extra,
  }
}

async function writeIssue(
  prisma: PrismaClient,
  mapping: GitLabProjectMapping,
  ownerId: string,
  issue: GitLabIssue,
  types: string[],
  now: () => Date,
) {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      return await writeIssueTransaction(prisma, mapping, ownerId, issue, types, now)
    } catch (error) {
      if (attempt === 0 && isRetryablePersistenceCollision(error)) continue
      throw toGitLabIssueError(error)
    }
  }
  throw new GitLabIssueError('PERSISTENCE_CONFLICT', 'The Issue could not be saved; retry the sync')
}

async function writeIssueTransaction(
  prisma: PrismaClient,
  mapping: GitLabProjectMapping,
  ownerId: string,
  issue: GitLabIssue,
  types: string[],
  now: () => Date,
) {
  const identity = {
    provider_canonicalGitLabInstanceUrl_gitLabProjectId_gitLabGlobalIssueId: {
      provider: 'gitlab',
      canonicalGitLabInstanceUrl: mapping.canonicalGitLabInstanceUrl,
      gitLabProjectId: mapping.gitLabProjectId,
      gitLabGlobalIssueId: issue.id,
    },
  }
  const nextStatus = toPublicState(issue.state)
  return prisma.$transaction(async (tx) => {
    await assertMappingUnchanged(tx, mapping)
    const reference = await tx.externalWorkItemReference.findUnique({ where: identity })
    if (!reference) return createImportedIssue(tx, mapping, ownerId, issue, types, nextStatus, now)
    return updateImportedIssue(tx, mapping, reference, issue, types, nextStatus, now)
  }, { isolationLevel: 'Serializable' })
}

async function assertMappingUnchanged(tx: Prisma.TransactionClient, mapping: GitLabProjectMapping) {
  const current = await tx.gitLabProjectMapping.findUnique({
    where: { id: mapping.id },
    select: { canonicalGitLabInstanceUrl: true, gitLabProjectId: true, projectId: true, updatedAt: true },
  })
  const matches = current?.canonicalGitLabInstanceUrl === mapping.canonicalGitLabInstanceUrl
    && current.gitLabProjectId === mapping.gitLabProjectId
    && current.projectId === mapping.projectId
    && current.updatedAt.getTime() === mapping.updatedAt.getTime()
  if (!matches) throw new GitLabIssueError('MAPPING_CHANGED', 'The Project mapping changed during sync; reload and retry')
}

async function createImportedIssue(
  tx: Prisma.TransactionClient,
  mapping: GitLabProjectMapping,
  ownerId: string,
  issue: GitLabIssue,
  types: string[],
  nextStatus: ReturnType<typeof toPublicState>,
  now: () => Date,
) {
  const workItem = await tx.workItem.create({
    data: {
      title: issue.title,
      description: issue.description,
      kind: 'Issue',
      priority: 'none',
      role: null,
      status: nextStatus,
      types,
      workDate: null,
      dueDate: issue.dueDate,
      ...(shouldStampSubmittedAt(nextStatus) ? { submittedAt: currentBangkokWallClockDate(now()) } : {}),
      projectId: mapping.projectId,
      assigneeId: ownerId,
    },
    select: { id: true },
  })
  await tx.externalWorkItemReference.create({
    data: {
      provider: 'gitlab',
      canonicalGitLabInstanceUrl: mapping.canonicalGitLabInstanceUrl,
      gitLabProjectId: mapping.gitLabProjectId,
      gitLabGlobalIssueId: issue.id,
      gitLabIssueIid: issue.iid,
      externalUrl: issue.webUrl,
      projectId: mapping.projectId,
      remoteCreatedAt: issue.remoteCreatedAt,
      remoteUpdatedAt: issue.remoteUpdatedAt,
      lastSyncedAt: currentBangkokWallClockDate(now()),
      workItemId: workItem.id,
    },
  })
  return { outcome: 'created', reason: 'created_from_gitlab', workItemId: workItem.id }
}

async function updateImportedIssue(
  tx: Prisma.TransactionClient,
  mapping: GitLabProjectMapping,
  reference: ExternalWorkItemReference,
  issue: GitLabIssue,
  types: string[],
  nextStatus: ReturnType<typeof toPublicState>,
  now: () => Date,
) {
  if (reference.projectId !== mapping.projectId) {
    throw new GitLabIssueError('SOURCE_IDENTITY_CONFLICT', 'This GitLab Issue is linked to another PMS Project')
  }
  if (issue.remoteUpdatedAt.getTime() < reference.remoteUpdatedAt.getTime()) {
    return { outcome: 'skipped', reason: 'stale_source', workItemId: reference.workItemId }
  }
  const workItem = await tx.workItem.findUnique({ where: { id: reference.workItemId } })
  if (!workItem) throw new GitLabIssueError('SOURCE_IDENTITY_CONFLICT', 'The linked Work Item is unavailable')
  if (workItem.projectId !== mapping.projectId) {
    throw new GitLabIssueError('SOURCE_IDENTITY_CONFLICT', 'The linked Work Item is outside its mapped PMS Project')
  }
  const workItemChanges = issueWorkItemChanges(workItem, issue, types, nextStatus, now)
  const hasReferenceChanges = gitLabReferenceChanged(reference, issue)
  if (Object.keys(workItemChanges).length === 0 && !hasReferenceChanges) {
    await tx.externalWorkItemReference.update({
      where: { id: reference.id },
      data: { lastSyncedAt: currentBangkokWallClockDate(now()) },
    })
    return { outcome: 'skipped', reason: 'no_changes', workItemId: workItem.id }
  }
  if (Object.keys(workItemChanges).length > 0) {
    await tx.workItem.update({ where: { id: workItem.id }, data: workItemChanges })
  }
  await tx.externalWorkItemReference.update({
    where: { id: reference.id },
    data: {
      gitLabIssueIid: issue.iid,
      externalUrl: issue.webUrl,
      remoteCreatedAt: issue.remoteCreatedAt,
      remoteUpdatedAt: issue.remoteUpdatedAt,
      lastSyncedAt: currentBangkokWallClockDate(now()),
    },
  })
  return { outcome: 'updated', reason: 'source_fields_changed', workItemId: workItem.id }
}

function issueWorkItemChanges(
  workItem: { title: string; description: string | null; status: string; types: string[]; dueDate: Date | null; submittedAt: Date | null },
  issue: GitLabIssue,
  types: string[],
  nextStatus: ReturnType<typeof toPublicState>,
  now: () => Date,
) {
  const changes: Record<string, unknown> = {}
  if (workItem.title !== issue.title) changes.title = issue.title
  if (workItem.description !== issue.description) changes.description = issue.description
  if (workItem.status !== nextStatus) changes.status = nextStatus
  if (!sameTypes(workItem.types, types)) changes.types = types
  if ((workItem.dueDate?.getTime() ?? null) !== (issue.dueDate?.getTime() ?? null)) changes.dueDate = issue.dueDate
  if (workItem.status !== nextStatus && shouldStampSubmittedAt(nextStatus) && !workItem.submittedAt) {
    changes.submittedAt = currentBangkokWallClockDate(now())
  }
  return changes
}

function gitLabReferenceChanged(reference: ExternalWorkItemReference, issue: GitLabIssue) {
  return reference.gitLabIssueIid !== issue.iid
    || reference.externalUrl !== issue.webUrl
    || reference.remoteCreatedAt.getTime() !== issue.remoteCreatedAt.getTime()
    || reference.remoteUpdatedAt.getTime() !== issue.remoteUpdatedAt.getTime()
}

function isRetryablePersistenceCollision(error: unknown) {
  const code = persistenceCode(error)
  return code === 'P2002' || code === 'P2034'
}

function toGitLabIssueError(error: unknown) {
  if (error instanceof GitLabIssueError) return error
  const code = persistenceCode(error)
  if (code === 'P2002') return new GitLabIssueError('SOURCE_IDENTITY_CONFLICT', 'This GitLab Issue is already linked to another Work Item')
  if (code === 'P2034') return new GitLabIssueError('PERSISTENCE_CONFLICT', 'The Issue changed during sync; retry the sync')
  return new GitLabIssueError('PERSISTENCE_FAILED', 'The Issue could not be saved')
}

function persistenceCode(error: unknown) {
  return typeof error === 'object' && error !== null && 'code' in error ? error.code : null
}

export async function syncGitLabProject(options: {
  prisma: PrismaClient
  mapping: GitLabProjectMapping
  ownerId: string
  config: GitLabConfiguration
  fetchImpl?: typeof fetch
  wait?: (ms: number) => Promise<void>
  now?: () => Date
}) {
  const { prisma, mapping, ownerId, config } = options
  const fetchImpl = options.fetchImpl ?? fetch
  const wait = options.wait ?? ((ms) => new Promise<void>((resolve) => setTimeout(resolve, ms)))
  const now = options.now ?? (() => new Date())
  if (mapping.canonicalGitLabInstanceUrl !== config.baseUrl) {
    throw new GitLabProviderError('PROVIDER_UNAVAILABLE', 'This mapping belongs to another configured GitLab instance', false)
  }
  if (!/^[1-9]\d*$/.test(mapping.gitLabProjectId)) {
    throw new GitLabProviderError('PROVIDER_UNAVAILABLE', 'The mapping has an invalid GitLab Project ID', false)
  }
  const labelMap = validateApprovedLabelMap(mapping.approvedLabelMap)
  if (!labelMap) throw new GitLabProviderError('PROVIDER_UNAVAILABLE', 'The approved label mapping is invalid', false)

  let rawIssues: RawIssue[] = []
  let runError: { code: string; message: string; retryable: boolean; nextPage: string | null } | undefined
  try {
    rawIssues = await listIssues(mapping, config, fetchImpl, wait)
  } catch (error) {
    if (error instanceof GitLabPaginationError) {
      rawIssues = error.issues
      runError = { code: error.code, message: error.message, retryable: error.retryable, nextPage: error.nextPage }
    } else if (error instanceof GitLabProviderError) {
      throw error
    } else {
      throw new GitLabProviderError('PROVIDER_UNAVAILABLE', 'GitLab pagination failed', true)
    }
  }

  const results: Array<Record<string, unknown>> = []
  for (const rawIssue of rawIssues) {
    let issue: GitLabIssue | null = null
    try {
      issue = parseIssue(rawIssue, mapping, config.baseUrl)
      const mappedTypes: string[] = []
      const warnings: string[] = []
      for (const label of issue.labels) {
        const mappedType = Object.hasOwn(labelMap, label) ? labelMap[label] : null
        if (!mappedType) warnings.push(`Unmapped GitLab label: ${label}`)
        else if (!mappedTypes.includes(mappedType)) mappedTypes.push(mappedType)
      }
      const result = await writeIssue(prisma, mapping, ownerId, issue, mappedTypes, now)
      results.push(issueOutcome(issue, result.outcome, result.workItemId, {
        ...(result.reason ? { reason: result.reason } : {}),
        ...(warnings.length ? { warnings } : {}),
      }))
    } catch (error) {
      const safe = error instanceof GitLabIssueError
        ? { code: error.code, message: error.message, retryable: error.code === 'PERSISTENCE_CONFLICT' }
        : { code: 'PERSISTENCE_FAILED', message: 'The Issue could not be saved', retryable: true }
      results.push(issueOutcome(issue ?? {
        id: validPositiveId(rawIssue.id) ?? 'unknown',
        iid: validPositiveId(rawIssue.iid) ?? 'unknown',
        title: typeof rawIssue.title === 'string' ? rawIssue.title : 'Invalid GitLab Issue',
        webUrl: typeof rawIssue.web_url === 'string' && sourceUrlMatchesInstance(rawIssue.web_url, config.baseUrl, validPositiveId(rawIssue.iid) ?? '') ? rawIssue.web_url : '',
      } as GitLabIssue, 'failed', null, { error: safe }))
    }
  }

  const counts = {
    created: results.filter((result) => result.outcome === 'created').length,
    updated: results.filter((result) => result.outcome === 'updated').length,
    skipped: results.filter((result) => result.outcome === 'skipped').length,
    failed: results.filter((result) => result.outcome === 'failed').length,
  }
  return { counts, results, ...(runError ? { runError } : {}) }
}
