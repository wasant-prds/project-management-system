import type {
  WorkItem,
  WorkItemKind,
  WorkItemPriority,
  WorkItemRole,
  WorkItemStatus,
} from '@/lib/database/types'
import type { SourceIssue } from '@/lib/issue-sync-provider'
import { IssueSyncError } from '@/lib/issue-sync-provider'
import {
  WORK_ITEM_KINDS,
  WORK_ITEM_PRIORITIES,
  WORK_ITEM_ROLES,
  WORK_ITEM_STATUSES,
  WORK_ITEM_TYPES,
} from '@/lib/work-items'

const roleNames: Record<string, string> = {
  sa: 'SA',
  dev: 'Developer',
  developer: 'Developer',
  infra: 'Infra',
  infrastructure: 'Infra',
  'system analyst': 'SA',
  'developer / infra': 'Developer / Infra',
  'developer / data migration': 'Developer / Data Migration',
}
const roleValues: Record<string, WorkItemRole> = { SA: 'SA', Developer: 'Developer', Infra: 'infra' }
const compact = (value: string) => value.normalize('NFC').replace(/\s+/g, ' ').trim()
const folded = (value: string) => compact(value).toLowerCase()
const roleName = (role: WorkItemRole) => roleNames[role.toLowerCase()]
function parseRolePrefix(value: string) {
  const lookup = (part: string) =>
    Object.hasOwn(roleNames, folded(part)) ? roleNames[folded(part)] : undefined
  const direct = lookup(value)
  const parts = compact(value)
    .split(/\s*\/\s*/)
    .map(lookup)
  const displayRole =
    direct ?? (parts.every((part) => part && roleValues[part]) ? [...new Set(parts)].join(' / ') : undefined)
  const roles = [
    ...new Set(
      (displayRole?.split(' / ') ?? []).flatMap((part) => (roleValues[part] ? [roleValues[part]] : [])),
    ),
  ]
  return { displayRole, roles, role: roles[0] }
}

export function issueTitleParts(value: string) {
  let stem = compact(value).replace(/^#{1,6}\s+/, '')
  let number: string | undefined
  let prefix: RegExpExecArray | null
  while ((prefix = /^\[\s*#(?:\u200b|&#8203;|&#x200b;)*([1-9]\d*)\s*\]\s*/i.exec(stem))) {
    number ??= prefix[1]
    stem = stem.slice(prefix[0].length)
  }
  const rolePrefix = /^\[([^\]]+)\]\s*/.exec(stem)
  const { displayRole, roles, role } = rolePrefix
    ? parseRolePrefix(rolePrefix[1])
    : { displayRole: undefined, roles: [], role: undefined }
  if (displayRole) stem = stem.slice(rolePrefix![0].length).trim()
  return { stem, number, displayRole, role, roles }
}

function single<T>(name: string, values: T[]): T | undefined {
  const unique = [...new Set(values)]
  if (unique.length > 1)
    throw new IssueSyncError(
      'SOURCE_LABEL_CONFLICT',
      `ต้นทางมี labels ${name} ที่ขัดแย้งกัน กรุณากำหนดให้เหลือค่าเดียว`,
      409,
    )
  return unique[0]
}

export function issueLabels(labels: string[], labelMap: Record<string, string>) {
  const kinds: WorkItemKind[] = [],
    priorities: WorkItemPriority[] = [],
    roles: Array<WorkItemRole | null> = [],
    statuses: WorkItemStatus[] = []
  const types = new Set<string>(),
    warnings: string[] = []
  for (const label of labels) {
    if (!label.trim() || label.length > 255 || /[\r\n\x00]/.test(label))
      throw new IssueSyncError('INVALID_SOURCE', 'Label ต้นทางไม่ถูกต้อง')
    const match = /^([^:]+)::(.+)$/.exec(label)
    const category = match?.[1].toLowerCase(),
      value = (match?.[2] ?? label).trim(),
      lower = value.toLowerCase()
    let recognized = false
    if (category === 'kind' || category === 'type') {
      const kind = WORK_ITEM_KINDS.find((candidate) => candidate.toLowerCase() === lower)
      if (kind) {
        kinds.push(kind)
        recognized = true
      }
    }
    if (category === 'priority' && WORK_ITEM_PRIORITIES.includes(lower as WorkItemPriority)) {
      priorities.push(lower as WorkItemPriority)
      recognized = true
    }
    if (category === 'status' && WORK_ITEM_STATUSES.includes(lower.replaceAll('_', '-') as WorkItemStatus)) {
      statuses.push(lower.replaceAll('_', '-') as WorkItemStatus)
      recognized = true
    }
    if (category === 'role') {
      const parsed = parseRolePrefix(value)
      if (lower === 'none' || parsed.roles.length) {
        roles.push(...(lower === 'none' ? [null] : parsed.roles))
        recognized = true
      }
    }
    if (Object.hasOwn(labelMap, label)) {
      types.add(labelMap[label])
      recognized = true
    } else if (
      !recognized &&
      (!category || category === 'type') &&
      WORK_ITEM_TYPES.includes(lower as (typeof WORK_ITEM_TYPES)[number])
    ) {
      types.add(lower)
      recognized = true
    }
    // Keep custom labels visible in the existing label badges, rather than silently dropping them.
    if (!recognized) {
      types.add(label)
      warnings.push(`Unmapped label: ${label}`)
    }
  }
  const sourceRoles = WORK_ITEM_ROLES.filter((role) => roles.includes(role))
  if (roles.includes(null) && sourceRoles.length) single('role', [null, sourceRoles[0]])
  return {
    kind: single('kind', kinds),
    priority: single('priority', priorities),
    role: sourceRoles[0] ?? (roles.includes(null) ? null : undefined),
    roles: sourceRoles,
    status: single('status', statuses),
    types: [...types].sort(),
    warnings,
  }
}

export function syncedIssueFields(
  issue: SourceIssue,
  labelMap: Record<string, string>,
  existing?: WorkItem | null,
) {
  const parts = issueTitleParts(issue.title)
  if (!parts.stem) throw new IssueSyncError('INVALID_SOURCE', 'Issue ไม่มีชื่อเรื่องหลังนำ prefix ออก')
  const labels = issueLabels(issue.labels, labelMap)
  const sourceRoles = labels.roles.length ? labels.roles : labels.role === null ? [] : parts.roles
  const role =
    labels.role === null
      ? null
      : sourceRoles.length
        ? parts.role && sourceRoles.includes(parts.role)
          ? parts.role
          : existing?.role && sourceRoles.includes(existing.role)
            ? existing.role
            : sourceRoles[0]
        : (existing?.role ?? null)
  const samePrefixRoles =
    sourceRoles.length > 0 &&
    parts.roles.length === sourceRoles.length &&
    parts.roles.every((value) => sourceRoles.includes(value))
  const displayRole =
    labels.role === null
      ? undefined
      : samePrefixRoles
        ? parts.displayRole
        : sourceRoles.length
          ? sourceRoles.map(roleName).join(' / ')
          : role
            ? roleName(role)
            : undefined
  const types = [
    ...new Set([
      ...labels.types,
      ...sourceRoles.filter((value) => value !== role).map((value) => `role::${value}`),
    ]),
  ].sort()
  return {
    fields: {
      title: `[#${issue.number}] ${displayRole ? `[${displayRole}] ` : ''}${parts.stem}`,
      description: issue.description,
      status: labels.status ?? issue.status,
      kind: labels.kind ?? existing?.kind ?? 'Issue',
      priority: labels.priority ?? existing?.priority ?? 'none',
      role,
      types,
      ...(issue.dueDate !== undefined ? { dueDate: issue.dueDate } : {}),
    },
    warnings: labels.warnings,
  }
}

export function matchesUnlinkedIssue(item: Pick<WorkItem, 'title' | 'description'>, issue: SourceIssue) {
  const local = issueTitleParts(item.title),
    source = issueTitleParts(issue.title)
  const sourceLine = (item.description ?? '').split(/\r?\n/).some((line) => {
    if (!/^\s*(?:\*\*)?(?:source(?: url)?|ต้นทาง|(?:gitlab|github) issue|issue)(?:\*\*)?\s*:/i.test(line))
      return false
    const index = line.indexOf(issue.url)
    return (
      index >= 0 &&
      (index === 0 || /[\s(<"']/.test(line[index - 1])) &&
      (index + issue.url.length === line.length || /[\s)\]>"']/.test(line[index + issue.url.length]))
    )
  })
  if (sourceLine) return true
  if (local.number && local.number !== issue.number) return false
  if (folded(local.stem) !== folded(source.stem)) return false
  return (
    local.number === issue.number ||
    !local.displayRole ||
    !source.displayRole ||
    local.displayRole === source.displayRole
  )
}

const metadataField =
  /^\s*(?:\*\*)?(?:source(?: url)?|ต้นทาง|(?:gitlab|github) issue|issue)(?:\*\*)?\s*:\s*(?:\*\*)?/i
const issueUrlIdentity = (url: string) => url.replace(/\/-\/work_items\/([1-9]\d*)$/, '/-/issues/$1')
function identityMetadata(item: Pick<WorkItem, 'title' | 'description'>) {
  const numbers = [issueTitleParts(item.title).number].filter((value): value is string => Boolean(value))
  const urls: string[] = []
  for (const line of (item.description ?? '').split(/\r?\n/)) {
    const prefix = metadataField.exec(line)
    if (!prefix) continue
    const value = line.slice(prefix[0].length).trimStart()
    const number = /^#(?:\u200b|&#8203;|&#x200b;)*(\d+)/i.exec(value)?.[1]
    if (number && /issue/i.test(prefix[0])) numbers.push(number)
    urls.push(
      ...(value.match(/https:\/\/[^\s<>"')\]]+/g) ?? [])
        .filter((url) => /\/(?:-\/)?(?:issues|work_items)\/\d+$/.test(url))
        .map(issueUrlIdentity),
    )
  }
  return { numbers, urls }
}

export function hasDifferentIssueIdentity(item: Pick<WorkItem, 'title' | 'description'>, issue: SourceIssue) {
  const { numbers, urls } = identityMetadata(item)
  const sourceUrl = issueUrlIdentity(issue.url)
  if (urls.includes(sourceUrl)) return false
  return numbers.some((number) => number !== issue.number) || urls.some((url) => url !== sourceUrl)
}

export function hasMatchingIssueIdentity(item: Pick<WorkItem, 'title' | 'description'>, issue: SourceIssue) {
  const { numbers, urls } = identityMetadata(item)
  if (urls.includes(issueUrlIdentity(issue.url))) return true
  return (
    !hasDifferentIssueIdentity(item, issue) &&
    numbers.includes(issue.number) &&
    matchesUnlinkedIssue(item, issue)
  )
}
