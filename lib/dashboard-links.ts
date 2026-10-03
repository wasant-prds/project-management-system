import type { DashboardFilters } from '@/lib/dashboard'

type WorkItemLinkOptions = {
  status?: string
  priority?: string
  openOnly?: boolean
  overdue?: boolean
}

function sharedFilters(filters: DashboardFilters, range = { startDate: filters.startDate, endDate: filters.endDate }) {
  const params = new URLSearchParams({ startDate: range.startDate, endDate: range.endDate })
  if (filters.companyId) params.set('companyId', filters.companyId)
  if (filters.projectId) params.set('projectId', filters.projectId)
  if (filters.role) params.set('role', filters.role)
  if (filters.kind) params.set('kind', filters.kind)
  return params
}

export function dashboardWorkItemsHref(filters: DashboardFilters, options: WorkItemLinkOptions = {}) {
  const params = sharedFilters(filters)
  if (options.status) params.set('status', options.status)
  if (options.priority) params.set('priority', options.priority)
  if (options.openOnly) params.set('openOnly', 'true')
  if (options.overdue) params.set('overdue', 'true')
  return `/work-items?${params.toString()}`
}

export function dashboardDailyWorkHref(
  filters: DashboardFilters,
  range = { startDate: filters.startDate, endDate: filters.endDate },
) {
  return `/daily-work?${sharedFilters(filters, range).toString()}`
}

export function dailyWorkHrefWithoutDashboardFilters(search: string, selectedDate: string | null) {
  const params = new URLSearchParams(search)
  for (const name of ['startDate', 'endDate', 'companyId', 'projectId', 'role', 'kind', 'date']) params.delete(name)
  if (selectedDate) params.set('date', selectedDate)
  const query = params.toString()
  return query ? `/daily-work?${query}` : '/daily-work'
}
