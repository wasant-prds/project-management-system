import { database as defaultDatabase, type Database } from '@/lib/database/client'
import { sql, and, syntax, type Sql } from '@/lib/database/sql'
import { workItems } from '@/lib/database/repositories/work-items'
import { projects as projectStore } from '@/lib/database/repositories/projects'
import { companies as companyStore } from '@/lib/database/repositories/companies'
import { reports } from '@/lib/database/repositories/reports'
import {
  bangkokDateRange,
  currentBangkokCalendarDate,
  serializeBangkokCalendarDate,
  serializeBangkokTimestamp,
} from '@/lib/bangkok-datetime'
import { completionRate } from '@/lib/project-management'
import { parsePublicId } from '@/lib/public-id'
import { WORK_ITEM_KINDS, WORK_ITEM_ROLES, serializeWorkItemStatus } from '@/lib/work-items'

export const DASHBOARD_TIMEZONE = 'Asia/Bangkok'
export const DASHBOARD_METRIC_VERSION = 'shared-work-v1'
export const DASHBOARD_METRIC_DEFINITIONS = {
  total: 'Owner WorkItems matching the selected date anchor and filters',
  open: 'total - completed - cancelled',
  completed: 'Owner WorkItems with status=completed',
  overdue: 'dueDate before the current Asia/Bangkok date and status not in completed,cancelled',
  completionRate: 'completed / (total - cancelled) * 100; zero denominator returns 0',
  loggedHours: 'Exact SUM(TimeEntry.hours) for the owner and selected period/filters',
  workItemDateAnchor: 'workDate ?? dueDate ?? createdAt',
  recentProjectProgress: 'completed / (total - cancelled) across all owner WorkItems in the Project',
} as const
const PREVIEW_LIMIT = 5

export type DashboardFilters = {
  startDate: string
  endDate: string
  companyId: string | null
  projectId: string | null
  role: string | null
  kind: string | null
}

export type ResolvedDashboardFilters = DashboardFilters & {
  companyInternalId: bigint | null
  projectInternalId: bigint | null
}

export class DashboardQueryError extends Error {
  constructor(
    readonly status: 400 | 404,
    readonly code: 'VALIDATION_ERROR' | 'RELATION_MISMATCH' | 'NOT_FOUND',
    message: string,
    readonly field?: string,
  ) {
    super(message)
  }
}

function dateText(value: Date) {
  return serializeBangkokCalendarDate(value)
}

function defaultDashboardPeriod(now: Date) {
  const today = currentBangkokCalendarDate(now)
  const [year, month] = today.split('-').map(Number)
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate()
  return {
    startDate: `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-01`,
    endDate: `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`,
  }
}

function queryId(params: URLSearchParams, name: string) {
  const value = params.get(name)?.trim() || null
  if (value && !parsePublicId(value)) return { error: name }
  return { publicId: value }
}

export function parseDashboardFilters(params: URLSearchParams, now = new Date()) {
  const rawStart = params.get('startDate')
  const rawEnd = params.get('endDate')
  if ((rawStart === null) !== (rawEnd === null)) {
    return {
      error: new DashboardQueryError(
        400,
        'VALIDATION_ERROR',
        'startDate and endDate must be provided together',
        'startDate',
      ),
    }
  }

  const period = rawStart === null ? defaultDashboardPeriod(now) : { startDate: rawStart, endDate: rawEnd! }
  const start = bangkokDateRange(period.startDate)
  const end = bangkokDateRange(period.endDate)
  if (!start || !end || end.start < start.start) {
    return {
      error: new DashboardQueryError(
        400,
        'VALIDATION_ERROR',
        'Date range must use valid ordered YYYY-MM-DD dates',
        'startDate',
      ),
    }
  }

  const companyRef = queryId(params, 'companyId')
  if ('error' in companyRef) {
    return { error: new DashboardQueryError(400, 'VALIDATION_ERROR', 'ต้องเป็น public UUID', 'companyId') }
  }
  const projectRef = queryId(params, 'projectId')
  if ('error' in projectRef) {
    return { error: new DashboardQueryError(400, 'VALIDATION_ERROR', 'ต้องเป็น public UUID', 'projectId') }
  }
  const companyId = companyRef.publicId
  const projectId = projectRef.publicId

  const roleParam = params.get('role')
  const role = roleParam?.trim() || null
  if (
    role !== null &&
    role !== 'none' &&
    !WORK_ITEM_ROLES.includes(role as (typeof WORK_ITEM_ROLES)[number])
  ) {
    return { error: new DashboardQueryError(400, 'VALIDATION_ERROR', 'Invalid role', 'role') }
  }

  const kindParam = params.get('kind')
  const kind = kindParam?.trim() || null
  if (kind !== null && !WORK_ITEM_KINDS.includes(kind as (typeof WORK_ITEM_KINDS)[number])) {
    return { error: new DashboardQueryError(400, 'VALIDATION_ERROR', 'Invalid kind', 'kind') }
  }

  return {
    filters: {
      ...period,
      companyId,
      projectId,
      role,
      kind,
    } satisfies DashboardFilters,
    range: { start: start.start, end: end.end },
  }
}

export function selectedWorkItemWhere(
  ownerId: bigint,
  filters: ResolvedDashboardFilters,
  range: { start: Date; end: Date },
): Sql {
  return and(
    sql`w.assignee_id=${ownerId}`,
    sql`COALESCE(w.work_date,w.due_date,w.created_at)>=${range.start} AND COALESCE(w.work_date,w.due_date,w.created_at)<${range.end}`,
    filters.projectInternalId ? sql`w.project_id=${filters.projectInternalId}` : null,
    filters.companyInternalId ? sql`p.company_id=${filters.companyInternalId}` : null,
    filters.role === 'none'
      ? sql`w.functional_role IS NULL`
      : filters.role
        ? sql`w.functional_role=${filters.role}`
        : null,
    filters.kind ? sql`w.kind=${filters.kind}` : null,
  )
}

export function selectedTimeEntryWhere(
  ownerId: bigint,
  filters: ResolvedDashboardFilters,
  range: { start: Date; end: Date },
): Sql {
  return and(
    sql`l.user_id=${ownerId} AND l.work_date>=${range.start} AND l.work_date<${range.end}`,
    filters.projectInternalId ? sql`w.project_id=${filters.projectInternalId}` : null,
    filters.companyInternalId ? sql`p.company_id=${filters.companyInternalId}` : null,
    filters.role === 'none'
      ? sql`w.id IS NOT NULL AND w.functional_role IS NULL`
      : filters.role
        ? sql`w.functional_role=${filters.role}`
        : null,
    filters.kind ? sql`w.kind=${filters.kind}` : null,
  )
}

export async function assertFilterRelations(
  filters: DashboardFilters,
  database: Database,
): Promise<ResolvedDashboardFilters> {
  let companyInternalId: bigint | null = null
  if (filters.companyId) {
    const company = await companyStore.byPublicId(filters.companyId, database)
    if (!company) throw new DashboardQueryError(404, 'NOT_FOUND', 'Company not found', 'companyId')
    companyInternalId = company.id
  }
  let projectInternalId: bigint | null = null
  if (filters.projectId) {
    const project = await projectStore.byPublicId(filters.projectId, database)
    if (!project) throw new DashboardQueryError(404, 'NOT_FOUND', 'Project not found', 'projectId')
    if (companyInternalId !== null && project.companyId !== companyInternalId) {
      throw new DashboardQueryError(
        400,
        'RELATION_MISMATCH',
        'Project does not belong to the selected Company',
        'projectId',
      )
    }
    projectInternalId = project.id
  }
  return { ...filters, companyInternalId, projectInternalId }
}

function serializeWorkItem(item: {
  publicId: string
  title: string
  kind: string
  priority: string
  role: string | null
  status: string
  workDate: Date | null
  dueDate: Date | null
  createdAt: Date
  updatedAt: Date
  project: {
    publicId: string
    name: string
    company: { publicId: string; name: string; displayName: string | null } | null
  }
}) {
  return {
    id: item.publicId,
    title: item.title,
    kind: item.kind,
    priority: item.priority,
    role: item.role,
    status: serializeWorkItemStatus(item.status as Parameters<typeof serializeWorkItemStatus>[0]),
    workDate: item.workDate ? dateText(item.workDate) : null,
    dueDate: item.dueDate ? dateText(item.dueDate) : null,
    createdAt: serializeBangkokTimestamp(item.createdAt),
    updatedAt: serializeBangkokTimestamp(item.updatedAt),
    project: {
      id: item.project.publicId,
      name: item.project.name,
      company: item.project.company
        ? {
            id: item.project.company.publicId,
            name: item.project.company.name,
            displayName: item.project.company.displayName,
          }
        : null,
    },
  }
}

function serializeProject(
  project: {
    publicId: string
    name: string
    status: string
    priority: string
    dueDate: Date
    createdAt: Date
    company: { publicId: string; name: string; displayName: string | null } | null
  },
  progress: number,
) {
  return {
    id: project.publicId,
    name: project.name,
    status: project.status,
    priority: project.priority,
    dueDate: dateText(project.dueDate),
    createdAt: serializeBangkokTimestamp(project.createdAt),
    company: project.company
      ? {
          id: project.company.publicId,
          name: project.company.name,
          displayName: project.company.displayName,
        }
      : null,
    progress,
  }
}

function groupProjectProgress(
  projects: Array<{
    id: bigint
    publicId: string
    name: string
    status: string
    priority: string
    dueDate: Date
    createdAt: Date
    company: { publicId: string; name: string; displayName: string | null } | null
  }>,
  groups: Array<{ projectId: bigint; status: string; _count: { _all: number } }>,
) {
  return projects.map((project) => {
    const counts = groups.filter((row) => row.projectId === project.id)
    const total = counts.reduce((sum, row) => sum + row._count._all, 0)
    const completed = counts.find((row) => row.status === 'completed')?._count._all ?? 0
    const cancelled = counts.find((row) => row.status === 'cancelled')?._count._all ?? 0
    return serializeProject(project, completionRate(total, completed, cancelled))
  })
}

export async function getDashboardSummary(
  ownerId: bigint,
  params: URLSearchParams,
  database: Database = defaultDatabase,
  now = new Date(),
) {
  const parsed = parseDashboardFilters(params, now)
  if (parsed.error) throw parsed.error
  const { filters, range } = parsed
  const resolved = await assertFilterRelations(filters, database)

  const workItemWhere = selectedWorkItemWhere(ownerId, resolved, range)
  const timeEntryWhere = selectedTimeEntryWhere(ownerId, resolved, range)
  const today = bangkokDateRange(currentBangkokCalendarDate(now))
  if (!today) throw new Error('Bangkok business date is invalid')
  const overdueWhere = and(
    workItemWhere,
    sql`w.due_date<${today.start} AND w.status NOT IN ('completed','cancelled')`,
  )
  const [
    counts,
    recentWorkItems,
    urgentWorkItems,
    overdueWorkItems,
    loggedHours,
    loggedHoursByDate,
    companies,
    projects,
    recentProjects,
  ] = await Promise.all([
    reports.counts(workItemWhere, today.start, database),
    workItems.list(workItemWhere, syntax('w.updated_at DESC,w.id DESC'), PREVIEW_LIMIT, database),
    workItems.list(
      and(workItemWhere, sql`w.priority='urgent' AND w.status NOT IN ('completed','cancelled')`),
      syntax('w.due_date ASC NULLS FIRST,w.updated_at DESC,w.id DESC'),
      PREVIEW_LIMIT,
      database,
    ),
    workItems.list(overdueWhere, syntax('w.due_date ASC,w.id ASC'), PREVIEW_LIMIT, database),
    reports.hours(timeEntryWhere, database),
    reports.hoursByDate(timeEntryWhere, database),
    reports.companies(database),
    reports.projects(resolved, database),
    projectStore.list(
      { companyId: resolved.companyInternalId, projectId: resolved.projectInternalId, limit: PREVIEW_LIMIT },
      database,
    ),
  ])
  const { total, completed, cancelled, overdue } = counts
  const projectProgress = await reports.projectProgress(
    recentProjects.map((project) => project.id),
    ownerId,
    database,
  )
  const summaryWorkItems = recentWorkItems.map(serializeWorkItem)
  const summaryUrgentItems = urgentWorkItems.map(serializeWorkItem)
  const summaryOverdueItems = overdueWorkItems.map(serializeWorkItem)

  return {
    meta: {
      period: { startDate: filters.startDate, endDate: filters.endDate },
      timezone: DASHBOARD_TIMEZONE,
      filters: {
        companyId: filters.companyId,
        projectId: filters.projectId,
        role: filters.role,
        kind: filters.kind,
      },
      metricDefinitions: DASHBOARD_METRIC_DEFINITIONS,
      metricVersion: DASHBOARD_METRIC_VERSION,
    },
    summary: {
      total,
      open: total - completed - cancelled,
      completed,
      overdue,
      completionRate: completionRate(total, completed, cancelled),
      loggedHours,
      recentWorkItems: summaryWorkItems,
      urgentWorkItems: summaryUrgentItems,
      overdueWorkItems: summaryOverdueItems,
      recentProjects: groupProjectProgress(recentProjects, projectProgress),
      loggedHoursByDate: loggedHoursByDate.map((group) => ({
        date: dateText(group.date),
        hours: group.hours,
      })),
    },
    filterOptions: {
      companies: companies.map((company) => ({
        id: company.publicId,
        name: company.name,
        displayName: company.displayName,
      })),
      projects: projects.map((project) => ({
        id: project.publicId,
        name: project.name,
        companyId: project.company.publicId,
      })),
    },
  }
}
