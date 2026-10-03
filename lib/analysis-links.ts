import type { DashboardFilters } from '@/lib/dashboard'

type AnalysisPeriod = Pick<DashboardFilters, 'startDate' | 'endDate'>
type AnalysisSourceFilters = Pick<DashboardFilters, 'companyId' | 'projectId' | 'role' | 'kind'>
type WorkItemSourceOptions = {
  status?: string
  priority?: string
  kind?: string
  workItemId?: string
}

function sourceParams(filters: AnalysisSourceFilters, period: AnalysisPeriod) {
  const params = new URLSearchParams({
    startDate: period.startDate,
    endDate: period.endDate,
  })
  if (filters.companyId) params.set('companyId', filters.companyId)
  if (filters.projectId) params.set('projectId', filters.projectId)
  if (filters.role) params.set('role', filters.role)
  if (filters.kind) params.set('kind', filters.kind)
  return params
}

export function analysisWorkItemsHref(
  filters: AnalysisSourceFilters,
  period: AnalysisPeriod,
  options: WorkItemSourceOptions = {},
) {
  const params = sourceParams(filters, period)
  if (options.status) params.set('status', options.status)
  if (options.priority) params.set('priority', options.priority)
  if (options.kind) params.set('kind', options.kind)
  if (options.workItemId) params.set('workItemId', options.workItemId)
  return `/work-items?${params.toString()}`
}

export function analysisDailyWorkHref(
  filters: AnalysisSourceFilters,
  period: AnalysisPeriod,
) {
  return `/daily-work?${sourceParams(filters, period).toString()}`
}
