import type { Prisma, WorkItemKind, WorkItemRole } from '@prisma/client'
import { prisma } from '@/lib/db'
import { bangkokDateRange, currentBangkokCalendarDate, serializeBangkokCalendarDate, serializeBangkokTimestamp } from '@/lib/bangkok-datetime'
import { completionRate } from '@/lib/project-management'
import {
  WORK_ITEM_KINDS,
  WORK_ITEM_ROLES,
  serializeWorkItemStatus,
} from '@/lib/work-items'

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
const CLOSED_STATUSES = ['completed', 'cancelled'] as ('completed' | 'cancelled')[]

export type DashboardFilters = {
  startDate: string
  endDate: string
  companyId: string | null
  projectId: string | null
  role: string | null
  kind: string | null
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
  return params.get(name)?.trim() || null
}

export function parseDashboardFilters(params: URLSearchParams, now = new Date()) {
  const rawStart = params.get('startDate')
  const rawEnd = params.get('endDate')
  if ((rawStart === null) !== (rawEnd === null)) {
    return { error: new DashboardQueryError(400, 'VALIDATION_ERROR', 'startDate and endDate must be provided together', 'startDate') }
  }

  const period = rawStart === null ? defaultDashboardPeriod(now) : { startDate: rawStart, endDate: rawEnd! }
  const start = bangkokDateRange(period.startDate)
  const end = bangkokDateRange(period.endDate)
  if (!start || !end || end.start < start.start) {
    return { error: new DashboardQueryError(400, 'VALIDATION_ERROR', 'Date range must use valid ordered YYYY-MM-DD dates', 'startDate') }
  }

  const companyId = queryId(params, 'companyId')
  const projectId = queryId(params, 'projectId')

  const roleParam = params.get('role')
  const role = roleParam?.trim() || null
  if (role !== null && role !== 'none' && !WORK_ITEM_ROLES.includes(role as typeof WORK_ITEM_ROLES[number])) {
    return { error: new DashboardQueryError(400, 'VALIDATION_ERROR', 'Invalid role', 'role') }
  }

  const kindParam = params.get('kind')
  const kind = kindParam?.trim() || null
  if (kind !== null && !WORK_ITEM_KINDS.includes(kind as typeof WORK_ITEM_KINDS[number])) {
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

function rangeAnchor(start: Date, end: Date): Prisma.WorkItemWhereInput {
  return {
    OR: [
      { workDate: { gte: start, lt: end } },
      { workDate: null, dueDate: { gte: start, lt: end } },
      { workDate: null, dueDate: null, createdAt: { gte: start, lt: end } },
    ],
  }
}

function selectedWorkItemWhere(ownerId: string, filters: DashboardFilters, range: { start: Date; end: Date }): Prisma.WorkItemWhereInput {
  const where: Prisma.WorkItemWhereInput = {
    assigneeId: ownerId,
    ...rangeAnchor(range.start, range.end),
  }
  if (filters.projectId) where.projectId = filters.projectId
  if (filters.companyId) where.project = { is: { companyId: filters.companyId } }
  if (filters.role === 'none') where.role = null
  else if (filters.role) where.role = filters.role as WorkItemRole
  if (filters.kind) where.kind = filters.kind as WorkItemKind
  return where
}

function selectedTimeEntryWhere(ownerId: string, filters: DashboardFilters, range: { start: Date; end: Date }): Prisma.TimeEntryWhereInput {
  const where: Prisma.TimeEntryWhereInput = {
    userId: ownerId,
    date: { gte: range.start, lt: range.end },
  }
  const workItem: Prisma.WorkItemWhereInput = {}
  const project: Prisma.ProjectWhereInput = {}
  if (filters.projectId) project.id = filters.projectId
  if (filters.companyId) project.companyId = filters.companyId
  if (filters.role === 'none') workItem.role = null
  else if (filters.role) workItem.role = filters.role as WorkItemRole
  if (filters.kind) workItem.kind = filters.kind as WorkItemKind
  if (Object.keys(project).length > 0) workItem.project = { is: project }
  if (Object.keys(workItem).length > 0) where.workItem = { is: workItem }
  return where
}

function selectedProjectsWhere(filters: DashboardFilters): Prisma.ProjectWhereInput {
  const where: Prisma.ProjectWhereInput = {}
  if (filters.companyId) where.companyId = filters.companyId
  if (filters.projectId) where.id = filters.projectId
  return where
}

async function assertFilterRelations(
  filters: DashboardFilters,
  database: Pick<typeof prisma, 'company' | 'project'>,
) {
  if (filters.companyId) {
    const company = await database.company.findUnique({ where: { id: filters.companyId }, select: { id: true } })
    if (!company) throw new DashboardQueryError(404, 'NOT_FOUND', 'Company not found', 'companyId')
  }
  if (filters.projectId) {
    const project = await database.project.findUnique({ where: { id: filters.projectId }, select: { id: true, companyId: true } })
    if (!project) throw new DashboardQueryError(404, 'NOT_FOUND', 'Project not found', 'projectId')
    if (filters.companyId && project.companyId !== filters.companyId) {
      throw new DashboardQueryError(400, 'RELATION_MISMATCH', 'Project does not belong to the selected Company', 'projectId')
    }
  }
}

function serializeWorkItem(item: {
  id: string
  title: string
  kind: string
  priority: string
  role: string | null
  status: string
  workDate: Date | null
  dueDate: Date | null
  createdAt: Date
  updatedAt: Date
  project: { id: string; name: string; company: { id: string; name: string; displayName: string | null } | null }
}) {
  return {
    id: item.id,
    title: item.title,
    kind: item.kind,
    priority: item.priority,
    role: item.role,
    status: serializeWorkItemStatus(item.status as Parameters<typeof serializeWorkItemStatus>[0]),
    workDate: item.workDate ? dateText(item.workDate) : null,
    dueDate: item.dueDate ? dateText(item.dueDate) : null,
    createdAt: serializeBangkokTimestamp(item.createdAt),
    updatedAt: serializeBangkokTimestamp(item.updatedAt),
    project: item.project,
  }
}

function serializeProject(project: {
  id: string
  name: string
  status: string
  priority: string
  dueDate: Date
  createdAt: Date
  company: { id: string; name: string; displayName: string | null } | null
}, progress: number) {
  return {
    id: project.id,
    name: project.name,
    status: project.status,
    priority: project.priority,
    dueDate: dateText(project.dueDate),
    createdAt: serializeBangkokTimestamp(project.createdAt),
    company: project.company,
    progress,
  }
}

function groupProjectProgress(
  projects: Array<{ id: string; name: string; status: string; priority: string; dueDate: Date; createdAt: Date; company: { id: string; name: string; displayName: string | null } | null }>,
  groups: Array<{ projectId: string; status: string; _count: { _all: number } }>,
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
  ownerId: string,
  params: URLSearchParams,
  database: typeof prisma = prisma,
  now = new Date(),
) {
  const parsed = parseDashboardFilters(params, now)
  if (parsed.error) throw parsed.error
  const { filters, range } = parsed
  await assertFilterRelations(filters, database)

  const workItemWhere = selectedWorkItemWhere(ownerId, filters, range)
  const timeEntryWhere = selectedTimeEntryWhere(ownerId, filters, range)
  const today = bangkokDateRange(currentBangkokCalendarDate(now))
  if (!today) throw new Error('Bangkok business date is invalid')
  const overdueWhere: Prisma.WorkItemWhereInput = {
    AND: [workItemWhere, { dueDate: { lt: today.start } }, { status: { notIn: CLOSED_STATUSES } }],
  }
  const recentWorkItemSelect = {
    id: true,
    title: true,
    kind: true,
    priority: true,
    role: true,
    status: true,
    workDate: true,
    dueDate: true,
    createdAt: true,
    updatedAt: true,
    project: {
      select: {
        id: true,
        name: true,
        company: { select: { id: true, name: true, displayName: true } },
      },
    },
  } as const
  const recentProjectsQuery = database.project.findMany({
    where: selectedProjectsWhere(filters),
    select: {
      id: true,
      name: true,
      status: true,
      priority: true,
      dueDate: true,
      createdAt: true,
      company: { select: { id: true, name: true, displayName: true } },
    },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: PREVIEW_LIMIT,
  })

  const [total, completed, cancelled, overdue, recentWorkItems, urgentWorkItems, overdueWorkItems, loggedHours, loggedHoursByDate, companies, projects, recentProjects] = await Promise.all([
    database.workItem.count({ where: workItemWhere }),
    database.workItem.count({ where: { AND: [workItemWhere, { status: 'completed' }] } }),
    database.workItem.count({ where: { AND: [workItemWhere, { status: 'cancelled' }] } }),
    database.workItem.count({ where: overdueWhere }),
    database.workItem.findMany({ where: workItemWhere, select: recentWorkItemSelect, orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }], take: PREVIEW_LIMIT }),
    database.workItem.findMany({ where: { AND: [workItemWhere, { priority: 'urgent' }, { status: { notIn: CLOSED_STATUSES } }] }, select: recentWorkItemSelect, orderBy: [{ dueDate: 'asc' }, { updatedAt: 'desc' }, { id: 'desc' }], take: PREVIEW_LIMIT }),
    database.workItem.findMany({ where: overdueWhere, select: recentWorkItemSelect, orderBy: [{ dueDate: 'asc' }, { id: 'asc' }], take: PREVIEW_LIMIT }),
    database.timeEntry.aggregate({ where: timeEntryWhere, _sum: { hours: true } }),
    database.timeEntry.groupBy({ by: ['date'], where: timeEntryWhere, _sum: { hours: true }, orderBy: { date: 'asc' } }),
    database.company.findMany({ select: { id: true, name: true, displayName: true }, orderBy: [{ name: 'asc' }, { id: 'asc' }] }),
    database.project.findMany({ where: selectedProjectsWhere(filters), select: { id: true, name: true, companyId: true }, orderBy: [{ name: 'asc' }, { id: 'asc' }] }),
    recentProjectsQuery,
  ])

  const recentProjectIds = recentProjects.map((project) => project.id)
  const projectProgress = recentProjectIds.length === 0
    ? []
    : await database.workItem.groupBy({
      by: ['projectId', 'status'],
      where: { assigneeId: ownerId, projectId: { in: recentProjectIds } },
      _count: { _all: true },
    })
  type SelectedDashboardWorkItem = Parameters<typeof serializeWorkItem>[0]
  const summaryWorkItems = (recentWorkItems as unknown as SelectedDashboardWorkItem[]).map(serializeWorkItem)
  const summaryUrgentItems = (urgentWorkItems as unknown as SelectedDashboardWorkItem[]).map(serializeWorkItem)
  const summaryOverdueItems = (overdueWorkItems as unknown as SelectedDashboardWorkItem[]).map(serializeWorkItem)

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
      loggedHours: loggedHours._sum.hours?.toString() ?? '0',
      recentWorkItems: summaryWorkItems,
      urgentWorkItems: summaryUrgentItems,
      overdueWorkItems: summaryOverdueItems,
      recentProjects: groupProjectProgress(recentProjects, projectProgress),
      loggedHoursByDate: loggedHoursByDate.map((group) => ({
        date: dateText(group.date),
        hours: group._sum.hours?.toString() ?? '0',
      })),
    },
    filterOptions: {
      companies,
      projects,
    },
  }
}
