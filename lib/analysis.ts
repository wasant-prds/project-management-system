import { prisma } from '@/lib/db'
import {
  bangkokDateRange,
  currentBangkokCalendarDate,
  parseBangkokCalendarDate,
  serializeBangkokCalendarDate,
  serializeBangkokTimestamp,
} from '@/lib/bangkok-datetime'
import { sumDecimalHours } from '@/lib/decimal-hours'
import { completionRate } from '@/lib/project-management'
import {
  assertFilterRelations,
  DASHBOARD_METRIC_DEFINITIONS,
  DASHBOARD_METRIC_VERSION,
  DASHBOARD_TIMEZONE,
  parseDashboardFilters,
  selectedTimeEntryWhere,
  selectedWorkItemWhere,
  type DashboardFilters,
} from '@/lib/dashboard'
import {
  WORK_ITEM_KINDS,
  WORK_ITEM_PRIORITIES,
  WORK_ITEM_STATUSES,
  serializeWorkItemStatus,
} from '@/lib/work-items'

const DAY_MILLISECONDS = 24 * 60 * 60 * 1000

export const ANALYSIS_METRIC_DEFINITIONS = {
  total: DASHBOARD_METRIC_DEFINITIONS.total,
  open: DASHBOARD_METRIC_DEFINITIONS.open,
  completed: DASHBOARD_METRIC_DEFINITIONS.completed,
  cancelled: 'Owner WorkItems with status=cancelled',
  overdue: DASHBOARD_METRIC_DEFINITIONS.overdue,
  completionRate: DASHBOARD_METRIC_DEFINITIONS.completionRate,
  loggedHours: DASHBOARD_METRIC_DEFINITIONS.loggedHours,
  workItemDateAnchor: DASHBOARD_METRIC_DEFINITIONS.workItemDateAnchor,
  statusBreakdown: 'Count of matching WorkItems by their current status; not historical throughput',
  kindBreakdown: 'Count of matching WorkItems by kind',
  priorityBreakdown: 'Count of matching WorkItems by priority',
  loggedHoursGrouping: 'Exact SUM(TimeEntry.hours) grouped by Bangkok calendar day, week, or month',
} as const

type Grouping = 'day' | 'week' | 'month'

function dateText(value: Date) {
  return serializeBangkokCalendarDate(value)
}

function periodDays(filters: DashboardFilters) {
  const start = parseBangkokCalendarDate(filters.startDate)
  const end = parseBangkokCalendarDate(filters.endDate)
  if (!start || !end) return 1
  return Math.floor((end.getTime() - start.getTime()) / DAY_MILLISECONDS) + 1
}

export function analysisGrouping(filters: DashboardFilters): Grouping {
  const days = periodDays(filters)
  if (days <= 31) return 'day'
  if (days <= 120) return 'week'
  return 'month'
}

function bucketBounds(dateTextValue: string, grouping: Grouping) {
  const date = parseBangkokCalendarDate(dateTextValue)
  if (!date) return null
  const start = new Date(date)
  const end = new Date(date)

  if (grouping === 'week') {
    start.setUTCDate(start.getUTCDate() - start.getUTCDay())
    end.setTime(start.getTime())
    end.setUTCDate(end.getUTCDate() + 6)
  } else if (grouping === 'month') {
    start.setUTCDate(1)
    end.setUTCDate(1)
    end.setUTCMonth(end.getUTCMonth() + 1)
    end.setUTCDate(0)
  }

  return {
    startDate: serializeBangkokCalendarDate(start),
    endDate: serializeBangkokCalendarDate(end),
  }
}

function intersectBounds(
  bounds: { startDate: string; endDate: string },
  period: Pick<DashboardFilters, 'startDate' | 'endDate'>,
) {
  const startTime = Math.max(Date.parse(bounds.startDate), Date.parse(period.startDate))
  const endTime = Math.min(Date.parse(bounds.endDate), Date.parse(period.endDate))
  return {
    startDate: new Date(startTime).toISOString().slice(0, 10),
    endDate: new Date(endTime).toISOString().slice(0, 10),
  }
}

function groupHours(
  entries: ReadonlyArray<{ date: Date; hours: { toString(): string } }>,
  filters: DashboardFilters,
  grouping: Grouping,
) {
  const buckets = new Map<string, { startDate: string; endDate: string; values: string[] }>()
  for (const entry of entries) {
    const bounds = bucketBounds(dateText(entry.date), grouping)
    if (!bounds) continue
    const range = intersectBounds(bounds, filters)
    const key = range.startDate
    const bucket = buckets.get(key) ?? { ...range, values: [] }
    bucket.values.push(entry.hours.toString())
    buckets.set(key, bucket)
  }

  return [...buckets.values()]
    .sort((left, right) => left.startDate.localeCompare(right.startDate))
    .map((bucket) => ({
      startDate: bucket.startDate,
      endDate: bucket.endDate,
      hours: sumDecimalHours(bucket.values),
    }))
}

function countBreakdown<T extends string>(values: ReadonlyArray<T>, labels: readonly T[]) {
  const counts = new Map(labels.map((label) => [label, 0]))
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1)
  return labels.map((value) => ({ value, count: counts.get(value) ?? 0 }))
}

function serializeWorkItem(item: {
  id: string
  title: string
  kind: string
  priority: string
  role: string | null
  status: Parameters<typeof serializeWorkItemStatus>[0]
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
    status: serializeWorkItemStatus(item.status),
    workDate: item.workDate ? dateText(item.workDate) : null,
    dueDate: item.dueDate ? dateText(item.dueDate) : null,
    createdAt: serializeBangkokTimestamp(item.createdAt),
    updatedAt: serializeBangkokTimestamp(item.updatedAt),
    project: item.project,
  }
}

function serializeTimeEntry(entry: {
  id: string
  date: Date
  hours: { toString(): string }
  description: string | null
  remarks: string | null
  workItem: {
    id: string
    title: string
    project: { id: string; name: string; company: { id: string; name: string; displayName: string | null } | null }
  } | null
}) {
  return {
    id: entry.id,
    date: dateText(entry.date),
    hours: entry.hours.toString(),
    description: entry.description,
    remarks: entry.remarks,
    workItem: entry.workItem,
  }
}

export async function getAnalysisSummary(
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
  const todayDate = currentBangkokCalendarDate(now)
  const today = bangkokDateRange(todayDate)
  if (!today) throw new Error('Bangkok business date is invalid')
  const workItemSelect = {
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
  const timeEntrySelect = {
    id: true,
    date: true,
    hours: true,
    description: true,
    remarks: true,
    workItem: {
      select: {
        id: true,
        title: true,
        project: {
          select: {
            id: true,
            name: true,
            company: { select: { id: true, name: true, displayName: true } },
          },
        },
      },
    },
  } as const
  const [workItems, timeEntries, companies, projects] = await Promise.all([
    database.workItem.findMany({
      where: workItemWhere,
      select: workItemSelect,
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
    }),
    database.timeEntry.findMany({
      where: timeEntryWhere,
      select: timeEntrySelect,
      orderBy: [{ date: 'desc' }, { id: 'desc' }],
    }),
    database.company.findMany({
      select: { id: true, name: true, displayName: true },
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
    }),
    database.project.findMany({
      select: { id: true, name: true, companyId: true },
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
    }),
  ])

  const completed = workItems.filter((item) => item.status === 'completed').length
  const cancelled = workItems.filter((item) => item.status === 'cancelled').length
  const overdue = workItems.filter((item) =>
    item.dueDate !== null
    && dateText(item.dueDate) < todayDate
    && item.status !== 'completed'
    && item.status !== 'cancelled',
  ).length
  const items = workItems.map(serializeWorkItem)
  const entries = timeEntries.map(serializeTimeEntry)
  const grouping = analysisGrouping(filters)

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
      metricDefinitions: ANALYSIS_METRIC_DEFINITIONS,
      metricVersion: DASHBOARD_METRIC_VERSION,
      loggedHoursGrouping: grouping,
    },
    summary: {
      total: items.length,
      open: items.length - completed - cancelled,
      completed,
      cancelled,
      overdue,
      completionRate: completionRate(items.length, completed, cancelled),
      loggedHours: sumDecimalHours(entries.map((entry) => entry.hours)),
    },
    breakdowns: {
      status: countBreakdown(items.map((item) => item.status), WORK_ITEM_STATUSES),
      kind: countBreakdown(items.map((item) => item.kind), WORK_ITEM_KINDS),
      priority: countBreakdown(items.map((item) => item.priority), WORK_ITEM_PRIORITIES),
    },
    loggedHoursByPeriod: groupHours(timeEntries, filters, grouping),
    workItems: items,
    timeEntries: entries,
    filterOptions: { companies, projects },
  }
}
