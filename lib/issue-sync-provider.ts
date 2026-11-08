import { canonicalSourceBaseUrl, parseSourceTimestamp } from '@/lib/integrations/source-validation'

export type IssueProvider = 'gitlab' | 'github'
export type SyncCredential = { tokenEnvVar: string; provider: IssueProvider; baseUrl: string; token: string }
export type SourceProject = { id: string; path: string }
export type SourceIssue = {
  id: string
  number: string
  title: string
  description: string | null
  status: 'todo' | 'completed'
  labels: string[]
  assignees: string[]
  dueDate?: Date | null
  url: string
  createdAt: Date
  updatedAt: Date
}

export class IssueSyncError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status = 503,
    readonly retryable = false,
  ) {
    super(message)
  }
}

// Dedicated token names prevent configs from reading unrelated application secrets.
export function isTokenEnvVar(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length <= 128 &&
    /^(?:GITLAB|GITHUB|ISSUE_SYNC)_[A-Z0-9_]*TOKEN(?:_[A-Z0-9]+)*$/.test(value)
  )
}

export function requiredCredential(
  tokenEnvVar: unknown,
  provider: string,
  instanceUrl: string,
  env: NodeJS.ProcessEnv = process.env,
): SyncCredential {
  if (!isTokenEnvVar(tokenEnvVar))
    throw new IssueSyncError(
      'VALIDATION_ERROR',
      'ระบุชื่อตัวแปร token เช่น GITLAB_TEAM_TOKEN, GITHUB_TOKEN หรือ ISSUE_SYNC_TOKEN_TEAM',
      400,
    )
  const baseUrl = canonicalSourceBaseUrl(instanceUrl)
  if (
    !baseUrl ||
    !['gitlab', 'github'].includes(provider) ||
    (provider === 'github' && baseUrl !== 'https://github.com')
  ) {
    throw new IssueSyncError('VALIDATION_ERROR', 'Provider หรือ HTTPS instance URL ไม่ถูกต้อง', 400)
  }
  const token = env[tokenEnvVar]?.trim()
  if (!token || /[\r\n]/.test(token) || /^(?:<.*>|replace.*|paste.*|change.*)$/i.test(token)) {
    throw new IssueSyncError(
      'CREDENTIAL_UNAVAILABLE',
      'ไม่พบ token ที่พร้อมใช้ตามชื่อตัวแปรใน config กรุณาตรวจ .env ของ app',
    )
  }
  return { tokenEnvVar, provider: provider as IssueProvider, baseUrl, token }
}

export function parseAssignees(value: unknown): string[] | null {
  if (
    !Array.isArray(value) ||
    value.length < 1 ||
    value.length > 50 ||
    value.some((name) => typeof name !== 'string' || !/^[a-zA-Z0-9_][a-zA-Z0-9_.-]{0,254}$/.test(name))
  )
    return null
  return [...new Set(value.map((name: string) => name.toLowerCase()))]
}

export function matchesAssignees(issue: SourceIssue, configured: string[]) {
  return issue.assignees.some((name) => configured.includes(name.toLowerCase()))
}

function positiveId(value: unknown) {
  const id =
    typeof value === 'number' && Number.isSafeInteger(value)
      ? String(value)
      : typeof value === 'string'
        ? value
        : ''
  return /^[1-9]\d*$/.test(id) ? id : null
}

function jsonWithIds(body: string) {
  return JSON.parse(body, (key, value, context?: { source?: string }) => {
    if (!['id', 'iid', 'project_id', 'number'].includes(key) || typeof value !== 'number') return value
    if (context?.source && /^[1-9]\d*$/.test(context.source)) return context.source
    if (!Number.isSafeInteger(value))
      throw new IssueSyncError('INVALID_SOURCE', 'Provider ส่ง identifier ที่อ่านอย่างแม่นยำไม่ได้')
    return value
  })
}

export class IssueSourceClient {
  readonly deadline: number
  constructor(
    readonly credential: SyncCredential,
    readonly fetchImpl: typeof fetch = fetch,
    readonly wait: (ms: number) => Promise<void> = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    budgetMs = 90_000,
  ) {
    this.deadline = Date.now() + budgetMs
  }

  endpoint(path: string) {
    return this.credential.provider === 'github'
      ? `https://api.github.com${path}`
      : `${this.credential.baseUrl}/api/v4${path}`
  }

  async request(url: string): Promise<{ data: unknown; headers: Headers }> {
    const target = new URL(url)
    const api = new URL(this.endpoint('/'))
    if (
      target.origin !== api.origin ||
      !target.pathname.startsWith(api.pathname) ||
      target.username ||
      target.password ||
      target.hash
    ) {
      throw new IssueSyncError('UNSAFE_SOURCE', 'Provider URL ไม่ตรงกับ instance ที่ตั้งไว้', 400)
    }
    for (let attempt = 0; attempt < 3; attempt++) {
      const remaining = this.deadline - Date.now()
      if (remaining <= 0)
        throw new IssueSyncError(
          'SYNC_BUDGET_EXCEEDED',
          'หมดเวลาของรอบนี้ กรุณากด Sync เพื่อทำต่อ',
          503,
          true,
        )
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), Math.min(15_000, remaining))
      let response: Response
      let body: string | undefined
      try {
        response = await this.fetchImpl(url, {
          method: 'GET',
          redirect: 'manual',
          cache: 'no-store',
          signal: controller.signal,
          headers:
            this.credential.provider === 'github'
              ? {
                  Authorization: `Bearer ${this.credential.token}`,
                  Accept: 'application/vnd.github+json',
                  'X-GitHub-Api-Version': '2022-11-28',
                }
              : { 'PRIVATE-TOKEN': this.credential.token, Accept: 'application/json' },
        })
        if (response.ok) body = await response.text()
      } catch {
        if (attempt < 2) {
          await this.wait(150 * 2 ** attempt)
          continue
        }
        throw new IssueSyncError('PROVIDER_UNAVAILABLE', 'ติดต่อ provider ไม่สำเร็จ', 503, true)
      } finally {
        clearTimeout(timer)
      }
      if (response.ok) {
        try {
          return { data: jsonWithIds(body!), headers: response.headers }
        } catch {
          throw new IssueSyncError('INVALID_SOURCE', 'Provider ส่งข้อมูลที่อ่านไม่ได้')
        }
      }
      const limited =
        response.status === 429 ||
        (response.status === 403 &&
          (response.headers.get('x-ratelimit-remaining') === '0' || response.headers.has('retry-after')))
      if ((limited || response.status >= 500) && attempt < 2) {
        const raw = response.headers.get('retry-after')
        const delay =
          raw === null
            ? 150 * 2 ** attempt
            : /^\d+(\.\d+)?$/.test(raw)
              ? Number(raw) * 1000
              : Date.parse(raw) - Date.now()
        if (Number.isFinite(delay) && delay >= 0 && delay <= 2000) {
          await this.wait(delay)
          continue
        }
      }
      throw new IssueSyncError(
        limited ? 'RATE_LIMITED' : 'PROVIDER_UNAVAILABLE',
        limited
          ? 'Provider จำกัดจำนวนคำขอ กรุณาลองใหม่ภายหลัง'
          : 'Provider ปฏิเสธคำขอ กรุณาตรวจสิทธิ์และ project',
        503,
        limited || response.status >= 500,
      )
    }
    throw new IssueSyncError('PROVIDER_UNAVAILABLE', 'ติดต่อ provider ไม่สำเร็จ', 503, true)
  }

  async resolveProject(input: string): Promise<SourceProject> {
    const github = this.credential.provider === 'github'
    if (github ? !/^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/.test(input) : !/^[a-zA-Z0-9_.\/-]+$/.test(input)) {
      throw new IssueSyncError('VALIDATION_ERROR', 'รูปแบบ source project ไม่ถูกต้อง', 400)
    }
    const { data } = await this.request(
      this.endpoint(github ? `/repos/${input}` : `/projects/${encodeURIComponent(input)}`),
    )
    const project = data as Record<string, unknown> | null
    const id = positiveId(project?.id)
    const path = github ? project?.full_name : project?.path_with_namespace
    if (
      !id ||
      typeof path !== 'string' ||
      !/^[a-zA-Z0-9_.-]+(?:\/[a-zA-Z0-9_.-]+)+$/.test(path) ||
      (github && path.toLowerCase() !== input.toLowerCase())
    )
      throw new IssueSyncError('INVALID_SOURCE', 'ไม่สามารถตรวจสอบ source project ได้')
    return { id, path }
  }

  issuesEndpoint(project: SourceProject) {
    return this.endpoint(
      this.credential.provider === 'github'
        ? `/repos/${project.path}/issues`
        : `/projects/${project.id}/issues`,
    )
  }

  async *issues(project: SourceProject, assignees: string[]) {
    const seen = new Set<string>()
    const endpoint = this.issuesEndpoint(project)
    // One username per query works on GitLab CE too; union gives OR semantics.
    for (const assignee of assignees) {
      for (let page = 1; page <= 1000; page++) {
        const url = new URL(endpoint)
        url.searchParams.set('state', 'all')
        url.searchParams.set('per_page', '100')
        url.searchParams.set('page', String(page))
        url.searchParams.set('sort', this.credential.provider === 'github' ? 'created' : 'asc')
        if (this.credential.provider === 'github') {
          url.searchParams.set('assignee', assignee)
          url.searchParams.set('direction', 'asc')
        } else {
          url.searchParams.set('assignee_username[]', assignee)
          url.searchParams.set('scope', 'all')
          url.searchParams.set('order_by', 'id')
        }
        const { data } = await this.request(url.href)
        if (!Array.isArray(data))
          throw new IssueSyncError('INVALID_SOURCE', 'Provider ส่งหน้า issues ไม่ถูกต้อง')
        for (const raw of data) {
          const id = positiveId(raw?.id)
          if (id && seen.has(id)) continue
          if (id) seen.add(id)
          yield raw as unknown
        }
        // Generate pagination locally: never forward credentials to a provider-supplied Link.
        if (data.length < 100) break
        if (page === 1000) throw new IssueSyncError('PAGE_LIMIT', 'จำนวนหน้าเกินขอบเขตของรอบ sync', 503, true)
      }
    }
  }

  async issue(project: SourceProject, number: string) {
    if (!positiveId(number)) throw new IssueSyncError('INVALID_SOURCE', 'Issue number ไม่ถูกต้อง')
    return (await this.request(`${this.issuesEndpoint(project)}/${number}`)).data
  }

  parseIssue(raw: unknown, project: SourceProject): SourceIssue | null {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw))
      throw new IssueSyncError('INVALID_SOURCE', 'ข้อมูล issue ไม่ถูกต้อง')
    const value = raw as Record<string, unknown>
    const github = this.credential.provider === 'github'
    if (github && 'pull_request' in value) return null
    const id = positiveId(value.id)
    const number = positiveId(github ? value.number : value.iid)
    const description = github ? value.body : value.description
    const createdAt = parseSourceTimestamp(value.created_at)
    const updatedAt = parseSourceTimestamp(value.updated_at)
    const url = github ? value.html_url : value.web_url
    const state = value.state
    const labels = Array.isArray(value.labels)
      ? value.labels.map((label) => (github && label && typeof label === 'object' ? label.name : label))
      : null
    const assignees = Array.isArray(value.assignees)
      ? value.assignees.map((person) =>
          person && typeof person === 'object' ? person[github ? 'login' : 'username'] : undefined,
        )
      : null
    if (
      !id ||
      !number ||
      typeof value.title !== 'string' ||
      !value.title.trim() ||
      value.title.length > 1000 ||
      (description != null && typeof description !== 'string') ||
      !createdAt ||
      !updatedAt ||
      (state !== (github ? 'open' : 'opened') && state !== 'closed') ||
      !labels ||
      !labels.every((label) => typeof label === 'string') ||
      !assignees ||
      !assignees.every((name) => typeof name === 'string') ||
      (!github && positiveId(value.project_id) !== project.id) ||
      typeof url !== 'string'
    ) {
      throw new IssueSyncError('INVALID_SOURCE', 'ข้อมูล issue ไม่ตรงกับ source project ที่กำหนด')
    }
    let source: URL
    try {
      source = new URL(url)
    } catch {
      throw new IssueSyncError('INVALID_SOURCE', 'Source URL ไม่ถูกต้อง')
    }
    const expected = github
      ? `https://github.com/${project.path}/issues/${number}`
      : `${this.credential.baseUrl}/${project.path}/-/issues/${number}`
    if (source.href !== expected) throw new IssueSyncError('INVALID_SOURCE', 'Source URL ไม่ตรงกับ project')
    let dueDate: Date | null | undefined
    if (!github) {
      dueDate =
        value.due_date == null
          ? null
          : typeof value.due_date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value.due_date)
            ? new Date(`${value.due_date}T00:00:00Z`)
            : new Date(NaN)
      if (
        dueDate &&
        (Number.isNaN(dueDate.getTime()) || dueDate.toISOString().slice(0, 10) !== value.due_date)
      )
        throw new IssueSyncError('INVALID_SOURCE', 'Due date ไม่ถูกต้อง')
    }
    return {
      id,
      number,
      title: value.title,
      description: (description as string) ?? null,
      status: state === 'closed' ? 'completed' : 'todo',
      labels: labels as string[],
      assignees: assignees as string[],
      dueDate,
      url: source.href,
      createdAt,
      updatedAt,
    }
  }
}
