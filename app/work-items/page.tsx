'use client'

import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AppSidebar } from '@/components/layout/app-sidebar'
import { AppHeader } from '@/components/layout/app-header'
import { SidebarProvider, SidebarInset } from '@/components/ui/sidebar'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { ArrowUpDown, Download, FileText, Plus, Search, Upload } from 'lucide-react'
import { toast } from '@/hooks/use-toast'
import {
  WORK_ITEM_PRIORITIES,
  WORK_ITEM_PRIORITY_LABELS,
  WORK_ITEM_ROLES,
  WORK_ITEM_ROLE_LABELS,
  WORK_ITEM_STATUSES,
  WORK_ITEM_STATUS_LABELS,
  type WorkItemKindValue,
} from '@/lib/work-items'
import { currentBangkokCalendarDate } from '@/lib/bangkok-datetime'
import { fetchCollection } from '@/lib/fetch-collection'
import { WorkItemViewDialog } from '@/components/page/work-items/work-item-view-dialog'
import { WorkItemGroupedList } from '@/components/page/work-items/work-item-grouped-list'
import { GitLabImportPanel } from '@/components/page/work-items/gitlab-import-panel'
import {
  createWorkItemFilterKey,
  isWorkItemListLoading,
  MONTH_OPTIONS,
  workItemDateParts,
} from '@/components/page/work-items/work-item-presentation'
import {
  DEFAULT_WORK_ITEM_SORT_MODE,
  downloadTextFile,
  flattenProjectGroups,
  generateWorkItemsCsv,
  generateWorkItemsJson,
  generateWorkItemsMarkdown,
  groupWorkItems,
  isWorkItemSortMode,
  urgencySubgroup,
  WORK_ITEM_HOVER_SORT_MODES,
  WORK_ITEM_SORT_LABELS,
  type WorkItemSortMode,
} from '@/components/page/work-items/work-item-export'
import type { ProjectOption, WorkItem } from '@/components/page/work-items/types'
import {
  emptyWorkItemForm,
  WorkItemDialog,
  type WorkItemFormValues,
} from '@/components/page/work-items/work-item-dialog'
import { SummaryStatCard } from '@/components/layout/summary-stat-card'
import { PageState } from '@/components/layout/page-state'
import { loadFailureVisual } from '@/components/ui/product-identity'
import {
  ACTION_LABEL_CLASS,
  FILTER_ROW,
  PAGE_HEADING,
  PAGE_INNER,
  PAGE_LEAD,
  PAGE_MAIN,
  PAGE_TOOLBAR,
  STAT_GRID,
  TAB_SCROLL_CLASS,
  TAB_TRIGGER_CLASS,
} from '@/components/layout/page-layout'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'

const SORT_MENU_CLOSE_DELAY_MS = 150

type KindTab = 'all' | WorkItemKindValue
type WorkItemSummary = {
  total: number
  inProgress: number
  completed: number
  overdue: number
  kinds: Record<WorkItemKindValue, number>
}
type ImportReport = { filename: string; imported: number; skipped: number; failed: number; rowMessages: string[] }

function isKindTab(value: string): value is KindTab {
  return value === 'all' || value === 'Incident' || value === 'Issue' || value === 'Task'
}

function toDateInput(value: string | null) {
  return value?.slice(0, 10) ?? ''
}

function toFormValues(item: WorkItem): WorkItemFormValues {
  return {
    id: item.id,
    title: item.title,
    description: item.description || '',
    kind: item.kind,
    priority: item.priority,
    role: item.role || '',
    status: item.status,
    types: item.types as WorkItemFormValues['types'],
    workDate: toDateInput(item.workDate),
    dueDate: toDateInput(item.dueDate),
    projectId: item.project.id,
  }
}

function matchesYearMonth(item: WorkItem, year: string, month: string) {
  if (year === 'all' && month === 'all') return true
  const parts = workItemDateParts(item)
  if (!parts) return false
  if (year !== 'all' && parts.year !== year) return false
  if (month !== 'all' && parts.month !== month) return false
  return true
}

type WorkItemQueryOptions = {
  year: string
  month: string
  project: string
  company: string
  dateRange: { startDate: string; endDate: string } | null
  search: string
  status: string
  priority: string
  role: string
  kind: string
  openOnly: boolean
  overdueOnly: boolean
  includeYears: boolean
  page?: { limit?: number; cursor?: string | null }
}

function workItemQuery({
  year,
  month,
  project,
  company,
  dateRange,
  search,
  status,
  priority,
  role,
  kind,
  openOnly,
  overdueOnly,
  includeYears,
  page,
}: WorkItemQueryOptions) {
  const params = new URLSearchParams({
    year: dateRange ? 'all' : year,
    month: dateRange ? 'all' : month,
  })
  params.set('limit', String(page?.limit ?? 50))
  if (project !== 'all') params.set('projectId', project)
  if (company !== 'all') params.set('companyId', company)
  if (dateRange) {
    params.set('startDate', dateRange.startDate)
    params.set('endDate', dateRange.endDate)
  }
  if (search.trim()) params.set('search', search.trim())
  if (status !== 'all') params.set('status', status)
  if (priority !== 'all') params.set('priority', priority)
  if (role !== 'all') params.set('role', role)
  if (kind !== 'all') params.set('kind', kind)
  if (openOnly) params.set('openOnly', 'true')
  if (overdueOnly) params.set('overdue', 'true')
  if (includeYears) params.set('includeYears', 'true')
  if (page?.cursor) params.set('cursor', page.cursor)
  return params.toString()
}

type WorkItemViewFilters = Pick<
  WorkItemQueryOptions,
  'year' | 'month' | 'project' | 'company' | 'dateRange' | 'status' | 'priority' | 'role' | 'kind' | 'openOnly' | 'overdueOnly'
>

function matchesProjectAndPeriod(item: WorkItem, filters: WorkItemViewFilters) {
  if (filters.project !== 'all' && item.project.id !== filters.project) return false
  if (filters.company !== 'all' && item.project.company?.id !== filters.company) return false
  if (filters.dateRange) {
    const anchor = item.workDate ?? item.dueDate ?? item.createdAt.slice(0, 10)
    const anchorDate = anchor.slice(0, 10)
    return anchorDate >= filters.dateRange.startDate && anchorDate <= filters.dateRange.endDate
  }
  return matchesYearMonth(item, filters.year, filters.month)
}

function matchesWorkItemFacets(item: WorkItem, filters: WorkItemViewFilters) {
  if (filters.kind !== 'all' && item.kind !== filters.kind) return false
  if (filters.status !== 'all' && item.status !== filters.status) return false
  if (filters.priority !== 'all' && item.priority !== filters.priority) return false
  if (filters.role === 'none') return item.role === null
  return filters.role === 'all' || item.role === filters.role
}

function matchesWorkItemState(item: WorkItem, filters: WorkItemViewFilters) {
  const isClosed = item.status === 'completed' || item.status === 'cancelled'
  if (filters.openOnly && isClosed) return false
  return !filters.overdueOnly || urgencySubgroup(item) === 'overdue'
}

function matchesWorkItemSearch(item: WorkItem, query: string) {
  if (!query) return true
  const values = [
    item.title,
    item.description,
    item.project.name,
    item.project.company?.name,
    item.project.company?.displayName,
    item.assignee.name,
    item.kind,
    item.status,
    item.priority,
    item.role,
    ...item.types,
  ]
  return values.some((value) => value?.toLowerCase().includes(query) ?? false)
}

function filterWorkItems(items: WorkItem[], filters: WorkItemViewFilters, search: string) {
  const query = search.trim().toLowerCase()
  return items.filter((item) =>
    matchesProjectAndPeriod(item, filters)
    && matchesWorkItemFacets(item, filters)
    && matchesWorkItemState(item, filters)
    && matchesWorkItemSearch(item, query),
  )
}

type WorkItemPageResponse = {
  workItems?: WorkItem[]
  page?: { nextCursor?: string | null }
  error?: string | { message?: string }
}

async function fetchWorkItemPage(query: string): Promise<WorkItemPageResponse> {
  const response = await fetch(`/api/work-items?${query}`)
  const data = await response.json() as WorkItemPageResponse
  if (!response.ok) {
    const message = typeof data.error === 'string' ? data.error : data.error?.message
    throw new Error(message || 'Failed to export work items')
  }
  return data
}

function WorkItemSortMenu({
  value,
  onChange,
}: Readonly<{ value: WorkItemSortMode; onChange: (mode: WorkItemSortMode) => void }>) {
  const [open, setOpen] = useState(false)
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const cancelClose = () => {
    if (closeTimer.current === null) return
    clearTimeout(closeTimer.current)
    closeTimer.current = null
  }

  const openMenu = () => {
    cancelClose()
    setOpen(true)
  }

  const scheduleClose = () => {
    cancelClose()
    closeTimer.current = setTimeout(() => setOpen(false), SORT_MENU_CLOSE_DELAY_MS)
  }

  useEffect(() => {
    return () => {
      if (closeTimer.current !== null) clearTimeout(closeTimer.current)
    }
  }, [])

  const handleOpenChange = (next: boolean) => {
    cancelClose()
    setOpen(next)
  }

  return (
    <DropdownMenu open={open} onOpenChange={handleOpenChange}>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="outline"
          className="w-full sm:w-auto"
          aria-label={`Sort work items: ${WORK_ITEM_SORT_LABELS[value]}`}
          onMouseEnter={openMenu}
          onMouseLeave={scheduleClose}
        >
          <ArrowUpDown className="h-4 w-4 shrink-0" />
          <span className="hidden truncate sm:inline">{WORK_ITEM_SORT_LABELS[value]}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        onMouseEnter={openMenu}
        onMouseLeave={scheduleClose}
      >
        <DropdownMenuRadioGroup
          value={value === DEFAULT_WORK_ITEM_SORT_MODE ? '' : value}
          onValueChange={(next) => {
            if (isWorkItemSortMode(next)) onChange(next)
          }}
        >
          {WORK_ITEM_HOVER_SORT_MODES.map((mode) => (
            <DropdownMenuRadioItem
              key={mode}
              value={mode}
              aria-label={WORK_ITEM_SORT_LABELS[mode]}
            >
              {WORK_ITEM_SORT_LABELS[mode]}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => onChange(DEFAULT_WORK_ITEM_SORT_MODE)}>
          Reset to default
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export default function WorkItemsPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const searchParamsValue = searchParams.toString()
  const requestedWorkItemId = useMemo(
    () => new URLSearchParams(searchParamsValue).get('workItemId')?.trim() ?? '',
    [searchParamsValue],
  )
  const [workItems, setWorkItems] = useState<WorkItem[]>([])
  const [workItemSummary, setWorkItemSummary] = useState<WorkItemSummary | null>(null)
  const [projects, setProjects] = useState<ProjectOption[]>([])
  const [companies, setCompanies] = useState<Array<{ id: string; name: string; displayName: string | null }>>([])
  const [availableYears, setAvailableYears] = useState<string[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('')
  const [yearFilter, setYearFilter] = useState(() => currentBangkokCalendarDate().slice(0, 4))
  const [monthFilter, setMonthFilter] = useState('all')
  const [projectFilter, setProjectFilter] = useState('all')
  const [companyFilter, setCompanyFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [priorityFilter, setPriorityFilter] = useState('all')
  const [roleFilter, setRoleFilter] = useState('all')
  const [kindTab, setKindTab] = useState<KindTab>('all')
  const [dashboardKindFilter, setDashboardKindFilter] = useState('all')
  const [dashboardDateRange, setDashboardDateRange] = useState<{ startDate: string; endDate: string } | null>(null)
  const [dashboardOpenOnly, setDashboardOpenOnly] = useState(false)
  const [dashboardOverdueOnly, setDashboardOverdueOnly] = useState(false)
  const [dashboardFiltersReady, setDashboardFiltersReady] = useState(false)
  const [sortMode, setSortMode] = useState<WorkItemSortMode>(DEFAULT_WORK_ITEM_SORT_MODE)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [dialogMode, setDialogMode] = useState<'create' | 'edit'>('create')
  const [formValues, setFormValues] = useState<WorkItemFormValues>(emptyWorkItemForm())
  const [viewItem, setViewItem] = useState<WorkItem | null>(null)
  const [isImporting, setIsImporting] = useState(false)
  const [importReport, setImportReport] = useState<ImportReport | null>(null)
  const [viewLoading, setViewLoading] = useState(false)
  const [deleteItem, setDeleteItem] = useState<WorkItem | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const importInputRef = useRef<HTMLInputElement>(null)
  const yearOptionsLoadedRef = useRef(false)
  const projectsLoadedRef = useRef(false)
  const projectsRequestRef = useRef<Promise<ProjectOption[]> | null>(null)
  const loadGenerationRef = useRef(0)
  const viewGenerationRef = useRef(0)
  const loadControllerRef = useRef<AbortController | null>(null)
  const [loadedFilterKey, setLoadedFilterKey] = useState<string | null>(null)
  const [loadingFilterKey, setLoadingFilterKey] = useState<string | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [isLoadingMore, setIsLoadingMore] = useState(false)

  const applyCalendarPeriod = useCallback((year: string, month: string) => {
    setDashboardDateRange(null)
    setYearFilter(year)
    setMonthFilter(month)
    const query = workItemQuery({
      year,
      month,
      project: projectFilter,
      company: companyFilter,
      dateRange: null,
      search: searchQuery,
      status: statusFilter,
      priority: priorityFilter,
      role: roleFilter,
      kind: dashboardKindFilter,
      openOnly: dashboardOpenOnly,
      overdueOnly: dashboardOverdueOnly,
      includeYears: false,
    })
    router.replace(`/work-items?${query}`, { scroll: false })
  }, [router, projectFilter, companyFilter, searchQuery, statusFilter, priorityFilter, roleFilter, dashboardKindFilter, dashboardOpenOnly, dashboardOverdueOnly])

  useEffect(() => {
    const params = new URLSearchParams(searchParamsValue)
    const startDate = params.get('startDate')
    const endDate = params.get('endDate')
    const hasDateRange = Boolean(startDate && endDate)
    setCompanyFilter(params.get('companyId') || 'all')
    setProjectFilter(params.get('projectId') || 'all')
    setStatusFilter(params.get('status') || 'all')
    setPriorityFilter(params.get('priority') || 'all')
    setRoleFilter(params.get('role') || 'all')
    const kind = params.get('kind') || 'all'
    setDashboardKindFilter(kind)
    setKindTab(isKindTab(kind) ? kind : 'all')
    setDashboardDateRange(hasDateRange ? { startDate: startDate!, endDate: endDate! } : null)
    setDashboardOpenOnly(params.get('openOnly') === 'true')
    setDashboardOverdueOnly(params.get('overdue') === 'true')

    const year = params.get('year')
    const month = params.get('month')
    setYearFilter(startDate && endDate ? startDate.slice(0, 4) : year || currentBangkokCalendarDate().slice(0, 4))
    setMonthFilter(hasDateRange ? 'all' : month || 'all')
    setDashboardFiltersReady(true)
  }, [searchParamsValue])

  useEffect(() => {
    if (!requestedWorkItemId) return

    const generation = ++viewGenerationRef.current
    let active = true
    setViewLoading(true)
    fetch(`/api/work-items/${encodeURIComponent(requestedWorkItemId)}`)
      .then(async (response) => {
        const data = await response.json()
        if (!response.ok) throw new Error(data.error?.message || 'โหลด Work Item ไม่สำเร็จ')
        return data.workItem as WorkItem
      })
      .then((item) => {
        if (active && generation === viewGenerationRef.current && item.id === requestedWorkItemId) setViewItem(item)
      })
      .catch((error: unknown) => {
        if (!active || generation !== viewGenerationRef.current) return
        toast({
          title: 'โหลด Work Item ไม่สำเร็จ',
          description: error instanceof Error ? error.message : 'กรุณาลองอีกครั้ง',
          variant: 'destructive',
        })
        setViewItem(null)
      })
      .finally(() => {
        if (active && generation === viewGenerationRef.current) setViewLoading(false)
      })

    return () => {
      active = false
      viewGenerationRef.current += 1
    }
  }, [requestedWorkItemId])

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearchQuery(searchQuery), 250)
    return () => clearTimeout(timer)
  }, [searchQuery])

  const load = useCallback(async () => {
    const generation = ++loadGenerationRef.current
    const filterKey = createWorkItemFilterKey({
      year: yearFilter,
      month: monthFilter,
      project: projectFilter,
      company: companyFilter,
      dateRange: dashboardDateRange,
      status: statusFilter,
      priority: priorityFilter,
      role: roleFilter,
      kind: dashboardKindFilter,
      openOnly: dashboardOpenOnly,
      overdueOnly: dashboardOverdueOnly,
      search: debouncedSearchQuery,
    })
    loadControllerRef.current?.abort()
    const controller = new AbortController()
    loadControllerRef.current = controller
    setLoadingFilterKey(filterKey)
    setLoadedFilterKey(null)
    setWorkItems([])
    setWorkItemSummary(null)
    setNextCursor(null)
    setIsLoadingMore(false)
    setLoadError(null)

    try {
      const query = workItemQuery({
        year: yearFilter,
        month: monthFilter,
        project: projectFilter,
        company: companyFilter,
        dateRange: dashboardDateRange,
        search: debouncedSearchQuery,
        status: statusFilter,
        priority: priorityFilter,
        role: roleFilter,
        kind: dashboardKindFilter,
        openOnly: dashboardOpenOnly,
        overdueOnly: dashboardOverdueOnly,
        includeYears: !yearOptionsLoadedRef.current,
      })
      const response = await fetch(`/api/work-items?${query}`, { signal: controller.signal })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error?.message || data.error || 'Failed to load work items')
      if (generation !== loadGenerationRef.current) return

      setWorkItems(data.workItems || [])
      setWorkItemSummary(data.summary ?? null)
      setNextCursor(data.page?.nextCursor ?? null)
      if (Array.isArray(data.years)) {
        setAvailableYears(data.years)
        yearOptionsLoadedRef.current = true
      }
      setLoadedFilterKey(filterKey)
    } catch (error) {
      if (controller.signal.aborted || generation !== loadGenerationRef.current) return
      console.error(error)
      setLoadError('Failed to load work items. Please try again.')
      toast({
        title: 'Error',
        description: 'Failed to load work items',
        variant: 'destructive',
      })
    } finally {
      if (generation === loadGenerationRef.current) setLoadingFilterKey(null)
    }
  }, [yearFilter, monthFilter, projectFilter, companyFilter, dashboardDateRange, statusFilter, priorityFilter, roleFilter, dashboardKindFilter, dashboardOpenOnly, dashboardOverdueOnly, debouncedSearchQuery])

  const refreshAfterMutation = useCallback(async () => {
    yearOptionsLoadedRef.current = false
    await load()
  }, [load])

  const loadMore = useCallback(async () => {
    if (!nextCursor || isLoadingMore) return
    const generation = loadGenerationRef.current
    setIsLoadingMore(true)
    try {
      const query = workItemQuery({
        year: yearFilter,
        month: monthFilter,
        project: projectFilter,
        company: companyFilter,
        dateRange: dashboardDateRange,
        search: debouncedSearchQuery,
        status: statusFilter,
        priority: priorityFilter,
        role: roleFilter,
        kind: dashboardKindFilter,
        openOnly: dashboardOpenOnly,
        overdueOnly: dashboardOverdueOnly,
        includeYears: false,
        page: { limit: 50, cursor: nextCursor },
      })
      const response = await fetch(`/api/work-items?${query}`)
      const data = await response.json()
      if (!response.ok) throw new Error(data.error?.message || data.error || 'Failed to load work items')
      if (generation !== loadGenerationRef.current) return
      setWorkItems((current) => [...current, ...(data.workItems || [])])
      setNextCursor(data.page?.nextCursor ?? null)
    } catch (error) {
      if (generation !== loadGenerationRef.current) return
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to load more work items',
        variant: 'destructive',
      })
    } finally {
      if (generation === loadGenerationRef.current) setIsLoadingMore(false)
    }
  }, [nextCursor, isLoadingMore, yearFilter, monthFilter, projectFilter, companyFilter, dashboardDateRange, debouncedSearchQuery, statusFilter, priorityFilter, roleFilter, dashboardKindFilter, dashboardOpenOnly, dashboardOverdueOnly])

  useEffect(() => {
    if (dashboardFiltersReady) void load()
  }, [dashboardFiltersReady, load])

  const ensureProjectsLoaded = useCallback(async () => {
    if (projectsLoadedRef.current) return true

    try {
      projectsRequestRef.current ??= fetch('/api/projects?options=work-items').then(async (response) => {
        const data = await response.json()
        if (!response.ok) throw new Error(data.error || 'Failed to load projects')
        return (data.projects || []) as ProjectOption[]
      })
      const nextProjects = await projectsRequestRef.current
      setProjects(nextProjects)
      projectsLoadedRef.current = true
      return true
    } catch (error) {
      console.error(error)
      toast({ title: 'Error', description: 'Failed to load projects', variant: 'destructive' })
      return false
    } finally {
      projectsRequestRef.current = null
    }
  }, [])

  useEffect(() => {
    void ensureProjectsLoaded()
  }, [ensureProjectsLoaded])

  useEffect(() => {
    fetchCollection<{ id: string; name: string; displayName: string | null }>('/api/company', 'companies')
      .then(setCompanies)
      .catch((error) => {
        console.error(error)
        toast({ title: 'Error', description: 'โหลด Company ไม่สำเร็จ', variant: 'destructive' })
      })
  }, [])

  const yearOptions = useMemo(() => {
    const years = new Set<string>([currentBangkokCalendarDate().slice(0, 4), ...availableYears])
    return [...years].sort((left, right) => Number(right) - Number(left))
  }, [availableYears])

  const filtered = useMemo(() => {
    const filters: WorkItemViewFilters = {
      year: yearFilter,
      month: monthFilter,
      project: projectFilter,
      company: companyFilter,
      dateRange: dashboardDateRange,
      kind: dashboardKindFilter,
      status: statusFilter,
      priority: priorityFilter,
      role: roleFilter,
      openOnly: dashboardOpenOnly,
      overdueOnly: dashboardOverdueOnly,
    }
    return filterWorkItems(workItems, filters, debouncedSearchQuery)
  }, [workItems, debouncedSearchQuery, yearFilter, monthFilter, projectFilter, companyFilter, dashboardDateRange, dashboardKindFilter, statusFilter, priorityFilter, roleFilter, dashboardOpenOnly, dashboardOverdueOnly])

  const visibleGroups = useMemo(() => {
    const scoped = kindTab === 'all' ? filtered : filtered.filter((item) => item.kind === kindTab)
    return groupWorkItems(scoped, sortMode)
  }, [filtered, kindTab, sortMode])

  const visibleItems = useMemo(() => flattenProjectGroups(visibleGroups), [visibleGroups])

  const expandResetKey = [
    yearFilter,
    monthFilter,
    projectFilter,
    companyFilter,
    dashboardDateRange?.startDate,
    dashboardDateRange?.endDate,
    statusFilter,
    priorityFilter,
    roleFilter,
    dashboardKindFilter,
    dashboardOpenOnly,
    dashboardOverdueOnly,
    searchQuery.trim(),
    kindTab,
    sortMode,
  ].join('|')

  const stats = {
    total: workItemSummary?.total ?? filtered.length,
    inProgress: workItemSummary?.inProgress ?? filtered.filter((item) => item.status === 'in-progress').length,
    completed: workItemSummary?.completed ?? filtered.filter((item) => item.status === 'completed').length,
    overdue: workItemSummary?.overdue ?? filtered.filter((item) => urgencySubgroup(item) === 'overdue').length,
  }

  const openCreate = async () => {
    if (!(await ensureProjectsLoaded())) return
    viewGenerationRef.current += 1
    setViewLoading(false)
    setViewItem(null)
    setDialogMode('create')
    setFormValues(emptyWorkItemForm())
    setDialogOpen(true)
  }

  const openView = async (item: WorkItem) => {
    const generation = ++viewGenerationRef.current
    setViewItem(item)
    setViewLoading(true)
    try {
      const response = await fetch(`/api/work-items/${item.id}`)
      const data = await response.json()
      if (!response.ok) throw new Error(data.error?.message || data.error || 'Failed to load work item details')
      if (generation === viewGenerationRef.current && data.workItem?.id === item.id) {
        setViewItem(data.workItem)
      }
    } catch (error) {
      if (generation !== viewGenerationRef.current) return
      toast({
        title: 'โหลดรายละเอียดไม่สำเร็จ',
        description: error instanceof Error ? error.message : 'กรุณาลองอีกครั้ง',
        variant: 'destructive',
      })
      setViewItem(null)
    } finally {
      if (generation === viewGenerationRef.current) setViewLoading(false)
    }
  }

  const openEdit = async (item: WorkItem) => {
    if (!(await ensureProjectsLoaded())) return
    viewGenerationRef.current += 1
    setViewLoading(false)
    setViewItem(null)
    setDialogMode('edit')
    setFormValues(toFormValues(item))
    setDialogOpen(true)
  }

  const handleDelete = (item: WorkItem) => setDeleteItem(item)

  const confirmDelete = async () => {
    if (!deleteItem) return
    setIsDeleting(true)
    try {
      const response = await fetch(`/api/work-items/${deleteItem.id}`, { method: 'DELETE' })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error?.message || data.error || 'Failed to delete work item')
      setViewItem(null)
      setDeleteItem(null)
      toast({ title: 'ลบ Work Item แล้ว', description: 'ลบรายการงานเรียบร้อย' })
      await refreshAfterMutation()
    } catch (error) {
      toast({
        title: 'ลบ Work Item ไม่สำเร็จ',
        description: error instanceof Error ? error.message : 'กรุณาลองอีกครั้ง',
        variant: 'destructive',
      })
    } finally {
      setIsDeleting(false)
    }
  }

  const exportFilename = (extension: 'csv' | 'md' | 'json') => {
    const date = currentBangkokCalendarDate()
    const kind = kindTab === 'all' ? 'all' : kindTab.toLowerCase()
    return `work_items_${kind}_${date}.${extension}`
  }

  const fetchAllFilteredItems = async () => {
    const allItems: WorkItem[] = []
    const seenCursors = new Set<string>()
    const fetchPage = (cursor: string | null): Promise<void> => {
      const query = workItemQuery({
        year: yearFilter,
        month: monthFilter,
        project: projectFilter,
        company: companyFilter,
        dateRange: dashboardDateRange,
        search: debouncedSearchQuery,
        status: statusFilter,
        priority: priorityFilter,
        role: roleFilter,
        kind: dashboardKindFilter,
        openOnly: dashboardOpenOnly,
        overdueOnly: dashboardOverdueOnly,
        includeYears: false,
        page: { limit: 200, cursor },
      })
      return fetchWorkItemPage(query).then((data) => {
        allItems.push(...(data.workItems ?? []))
        const nextCursor = data.page?.nextCursor ?? null
        if (!nextCursor) return
        if (seenCursors.has(nextCursor)) throw new Error('Work Item export cursor repeated')
        seenCursors.add(nextCursor)
        return fetchPage(nextCursor)
      })
    }

    await fetchPage(null)

    const scopedItems = kindTab === 'all' ? allItems : allItems.filter((item) => item.kind === kindTab)
    return flattenProjectGroups(groupWorkItems(scopedItems, sortMode))
  }

  const exportCsv = async () => {
    try {
      const exportItems = await fetchAllFilteredItems()
      if (exportItems.length === 0) return
      downloadTextFile(generateWorkItemsCsv(exportItems), exportFilename('csv'), 'text/csv;charset=utf-8;')
    } catch (error) {
      toast({ title: 'Export failed', description: error instanceof Error ? error.message : 'Failed to export work items', variant: 'destructive' })
    }
  }

  const exportMarkdown = async () => {
    try {
      const exportItems = await fetchAllFilteredItems()
      if (exportItems.length === 0) return
      downloadTextFile(generateWorkItemsMarkdown(exportItems, sortMode), exportFilename('md'), 'text/markdown;charset=utf-8;')
    } catch (error) {
      toast({ title: 'Export failed', description: error instanceof Error ? error.message : 'Failed to export work items', variant: 'destructive' })
    }
  }

  const exportJson = async () => {
    try {
      const exportItems = await fetchAllFilteredItems()
      if (exportItems.length === 0) return
      downloadTextFile(generateWorkItemsJson(exportItems), exportFilename('json'), 'application/json;charset=utf-8;')
    } catch (error) {
      toast({ title: 'Export failed', description: error instanceof Error ? error.message : 'Failed to export work items', variant: 'destructive' })
    }
  }

  const handleImportFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return

    let rows: unknown
    try {
      rows = JSON.parse(await file.text())
    } catch {
      toast({ title: 'Invalid JSON', description: 'Choose a valid JSON file.', variant: 'destructive' })
      return
    }

    if (!Array.isArray(rows) || rows.length === 0) {
      toast({
        title: 'Invalid file',
        description: 'The JSON file must contain a non-empty array of work items.',
        variant: 'destructive',
      })
      return
    }

    setIsImporting(true)
    setImportReport(null)
    try {
      const response = await fetch('/api/work-items/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(rows),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error?.message || data.error || 'Failed to import work items')

      const outcomes = Array.isArray(data.rows) ? data.rows : []
      const skipped = outcomes.filter((item: { outcome?: string }) => item.outcome === 'skipped').length
      const failed = outcomes.filter((item: { outcome?: string }) => item.outcome === 'failed').length
      const rowMessages = outcomes
        .filter((item: { outcome?: string }) => item.outcome !== 'created')
        .map((item: { row?: unknown; outcome?: string; error?: { message?: unknown } }) => {
          const rowLabel = typeof item.row === 'number' ? item.row : '?'
          const reason = typeof item.error?.message === 'string' ? item.error.message : 'ไม่ทราบสาเหตุ'
          return `แถว ${rowLabel}: ${reason}`
        })
      setImportReport({ filename: file.name, imported: data.imported ?? 0, skipped, failed, rowMessages })
      toast({
        title: failed > 0 ? 'นำเข้าเสร็จพร้อมข้อผิดพลาด' : 'นำเข้าเสร็จแล้ว',
        description: `เพิ่ม ${data.imported ?? 0} รายการ · ข้าม ${skipped} · ผิดพลาด ${failed}`,
        ...(failed > 0 ? { variant: 'destructive' as const } : {}),
      })
      await refreshAfterMutation()
    } catch (error) {
      toast({
        title: 'Import failed',
        description: error instanceof Error ? error.message : 'Failed to import work items',
        variant: 'destructive',
      })
    } finally {
      setIsImporting(false)
    }
  }

  const filterKey = createWorkItemFilterKey({
    year: yearFilter,
    month: monthFilter,
    project: projectFilter,
    company: companyFilter,
    dateRange: dashboardDateRange,
    status: statusFilter,
    priority: priorityFilter,
    role: roleFilter,
    kind: dashboardKindFilter,
    openOnly: dashboardOpenOnly,
    overdueOnly: dashboardOverdueOnly,
    search: debouncedSearchQuery,
  })
  const resultsAreCurrent = loadedFilterKey === filterKey
  const isListLoading = isWorkItemListLoading(loadedFilterKey, loadingFilterKey, filterKey, loadError)
  const countsAvailable = !isListLoading && !loadError

  let listContent = (
    <WorkItemGroupedList
      groups={visibleGroups}
      resetKey={expandResetKey}
      onView={openView}
      onEdit={openEdit}
      onDelete={handleDelete}
    />
  )
  if (isListLoading) {
    listContent = <PageState kind="loading" title="กำลังโหลด Work Items…" loadingLayout="rows" />
  } else if (loadError && !resultsAreCurrent) {
    listContent = <PageState kind="error" visual={loadFailureVisual(loadError)} title="โหลด Work Items ไม่สำเร็จ" description={loadError} action={<Button type="button" variant="outline" onClick={load}>ลองอีกครั้ง</Button>} />
  }

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <AppHeader />
        <main className={PAGE_MAIN}>
          <div className={PAGE_INNER}>
            <div className={PAGE_TOOLBAR}>
              <div className="min-w-0">
                <p className="page-eyebrow mb-2">Work register</p>
                <h1 className={PAGE_HEADING}>Work Items</h1>
                <p className={PAGE_LEAD}>
                  จัดการ Incident, Issue และ Task ในพื้นที่เดียวกัน
                </p>
              </div>
              <div className="flex flex-wrap items-center justify-end gap-2">
                <input
                  ref={importInputRef}
                  type="file"
                  accept=".json,application/json"
                  className="hidden"
                  onChange={handleImportFile}
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => importInputRef.current?.click()}
                  disabled={isImporting}
                  aria-label="Import work items from JSON"
                >
                  <Upload className="h-4 w-4" />
                  <span className={ACTION_LABEL_CLASS}>{isImporting ? 'Importing…' : 'Import JSON'}</span>
                </Button>
                <Button
                  variant="info"
                  onClick={exportCsv}
                  disabled={visibleItems.length === 0}
                  aria-label="Export CSV"
                >
                  <Download className="h-4 w-4" />
                  <span className={ACTION_LABEL_CLASS}>Export CSV</span>
                </Button>
                <Button
                  variant="success"
                  onClick={exportMarkdown}
                  disabled={visibleItems.length === 0}
                  aria-label="Export Markdown"
                >
                  <FileText className="h-4 w-4" />
                  <span className={ACTION_LABEL_CLASS}>Export Markdown</span>
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={exportJson}
                  disabled={visibleItems.length === 0}
                  aria-label="Export importable JSON"
                >
                  <Download className="h-4 w-4" />
                  <span className={ACTION_LABEL_CLASS}>Export JSON</span>
                </Button>
                <Button magnetic onClick={openCreate}>
                  <Plus className="h-4 w-4" />
                  <span className="sm:hidden">New</span>
                  <span className="hidden sm:inline">New Work Item</span>
                </Button>
              </div>
            </div>

            {dashboardDateRange && (
              <section className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-card px-4 py-3 text-sm" aria-label="ตัวกรองจาก Dashboard">
                <p className="text-muted-foreground">
                  ตัวกรองจาก Dashboard: {dashboardDateRange.startDate} – {dashboardDateRange.endDate}
                  {companyFilter !== 'all' ? ` · Company ${companyFilter}` : ''}
                  {projectFilter !== 'all' ? ` · Project ${projectFilter}` : ''}
                  {roleFilter !== 'all' ? ` · role ${roleFilter}` : ''}
                  {dashboardKindFilter !== 'all' ? ` · ${dashboardKindFilter}` : ''}
                  {dashboardOpenOnly ? ' · Open' : ''}
                  {dashboardOverdueOnly ? ' · Overdue' : ''}
                </p>
                <div className="flex flex-wrap gap-3">
                  <button type="button" onClick={() => applyCalendarPeriod(yearFilter, monthFilter)} className="text-link underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">ใช้ตัวกรอง Year/Month</button>
                  <Link href="/work-items" className="text-link underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">ล้างตัวกรอง Dashboard</Link>
                </div>
              </section>
            )}

            {importReport && (
              <section className="space-y-2 rounded-lg border bg-card p-3 text-sm" aria-live="polite">
                <p className="font-medium">
                  {importReport.filename}: เพิ่ม {importReport.imported} · ข้าม {importReport.skipped} · ผิดพลาด {importReport.failed}
                </p>
                {importReport.rowMessages.length > 0 && (
                  <ul className="max-h-40 space-y-1 overflow-y-auto text-danger" aria-label="Import row results">
                    {importReport.rowMessages.map((message, index) => <li key={`${index}-${message}`}>{message}</li>)}
                  </ul>
                )}
              </section>
            )}

            <GitLabImportPanel projects={projects} onSynced={refreshAfterMutation} />

            <div className={`cinematic-beat-data ${STAT_GRID}`}>
              <SummaryStatCard label="Total" value={stats.total} isLoading={isListLoading} unavailable={Boolean(loadError)} />
              <SummaryStatCard
                label="In Progress"
                value={stats.inProgress}
                isLoading={isListLoading} unavailable={Boolean(loadError)}
                valueClassName="text-info"
              />
              <SummaryStatCard
                label="Completed"
                value={stats.completed}
                isLoading={isListLoading} unavailable={Boolean(loadError)}
                valueClassName="text-success"
              />
              <SummaryStatCard
                label="Overdue"
                value={stats.overdue}
                isLoading={isListLoading} unavailable={Boolean(loadError)}
                valueClassName="text-danger"
              />
            </div>

            <div className={`cinematic-beat-support ${FILTER_ROW} filter-panel`}>
              <div className="relative w-full max-w-none flex-1 sm:max-w-md">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  type="search"
                  placeholder="ค้นหา Work Items…" aria-label="ค้นหา Work Items"
                  className="bg-secondary/50 pl-10"
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                />
              </div>
              <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto sm:flex-wrap">
                <Select value={companyFilter} onValueChange={setCompanyFilter}>
                  <SelectTrigger className="w-full bg-secondary/50 sm:w-[180px]" aria-label="กรอง Company">
                    <SelectValue placeholder="Company" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">ทุก Company</SelectItem>
                    {companies.map((company) => <SelectItem key={company.id} value={company.id}>{company.displayName ?? company.name}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Select value={yearFilter} onValueChange={(value) => applyCalendarPeriod(value, monthFilter)}>
                  <SelectTrigger className="w-full bg-secondary/50 sm:w-[130px]">
                    <SelectValue placeholder="Year" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All years</SelectItem>
                    {yearOptions.map((year) => (
                      <SelectItem key={year} value={year}>{year}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={monthFilter} onValueChange={(value) => applyCalendarPeriod(yearFilter, value)}>
                  <SelectTrigger className="w-full bg-secondary/50 sm:w-[150px]">
                    <SelectValue placeholder="Month" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All months</SelectItem>
                    {MONTH_OPTIONS.map((month) => (
                      <SelectItem key={month.value} value={month.value}>{month.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <div className="col-span-2 sm:col-auto">
                  <Select value={projectFilter} onValueChange={setProjectFilter}>
                    <SelectTrigger className="w-full bg-secondary/50 sm:w-[220px]">
                      <SelectValue placeholder="Project" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All projects</SelectItem>
                      {projects.map((project) => (
                        <SelectItem key={project.id} value={project.id}>{project.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="col-span-2 sm:col-auto">
                  <WorkItemSortMenu value={sortMode} onChange={setSortMode} />
                </div>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-full bg-secondary/50 sm:w-[150px]">
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All statuses</SelectItem>
                    {WORK_ITEM_STATUSES.map((status) => (
                      <SelectItem key={status} value={status}>{WORK_ITEM_STATUS_LABELS[status]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={priorityFilter} onValueChange={setPriorityFilter}>
                  <SelectTrigger className="w-full bg-secondary/50 sm:w-[150px]">
                    <SelectValue placeholder="Priority" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All priorities</SelectItem>
                    {WORK_ITEM_PRIORITIES.map((priority) => (
                      <SelectItem key={priority} value={priority}>{WORK_ITEM_PRIORITY_LABELS[priority]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={roleFilter} onValueChange={setRoleFilter}>
                  <SelectTrigger className="w-full bg-secondary/50 sm:w-[150px]">
                    <SelectValue placeholder="Role" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All roles</SelectItem>
                    <SelectItem value="none">No role</SelectItem>
                    {WORK_ITEM_ROLES.map((role) => (
                      <SelectItem key={role} value={role}>{WORK_ITEM_ROLE_LABELS[role]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <Tabs
              value={kindTab}
              onValueChange={(value) => {
                if (!isKindTab(value)) return
                setKindTab(value)
                setDashboardKindFilter(value === 'all' ? 'all' : value)
              }}
              className="space-y-4"
            >
              <div className={TAB_SCROLL_CLASS}>
                <TabsList>
                  <TabsTrigger className={TAB_TRIGGER_CLASS} value="all">
                    All ({countsAvailable ? workItemSummary?.total ?? filtered.length : '—'})
                  </TabsTrigger>
                  <TabsTrigger className={TAB_TRIGGER_CLASS} value="Incident">
                    Incidents ({countsAvailable ? workItemSummary?.kinds.Incident ?? filtered.filter((item) => item.kind === 'Incident').length : '—'})
                  </TabsTrigger>
                  <TabsTrigger className={TAB_TRIGGER_CLASS} value="Issue">
                    Issues ({countsAvailable ? workItemSummary?.kinds.Issue ?? filtered.filter((item) => item.kind === 'Issue').length : '—'})
                  </TabsTrigger>
                  <TabsTrigger className={TAB_TRIGGER_CLASS} value="Task">
                    Tasks ({countsAvailable ? workItemSummary?.kinds.Task ?? filtered.filter((item) => item.kind === 'Task').length : '—'})
                  </TabsTrigger>
                </TabsList>
              </div>
              <TabsContent value={kindTab}>
                {listContent}
                {nextCursor && resultsAreCurrent && (
                  <div className="flex justify-center pt-4">
                    <Button type="button" variant="outline" onClick={loadMore} disabled={isLoadingMore}>
                      {isLoadingMore ? 'กำลังโหลด...' : 'โหลดรายการเพิ่มเติม'}
                    </Button>
                  </div>
                )}
              </TabsContent>
            </Tabs>
          </div>
        </main>

        <WorkItemViewDialog
          open={Boolean(viewItem)}
          item={viewItem}
          isLoading={viewLoading}
          onOpenChange={(open) => {
            if (!open) {
              viewGenerationRef.current += 1
              setViewLoading(false)
              setViewItem(null)
              if (requestedWorkItemId) {
                const params = new URLSearchParams(searchParamsValue)
                params.delete('workItemId')
                const query = params.toString()
                router.replace(query ? `/work-items?${query}` : '/work-items', { scroll: false })
              }
            }
          }}
          onEdit={openEdit}
        />

        <AlertDialog open={deleteItem !== null} onOpenChange={(open) => {
          if (!open && !isDeleting) setDeleteItem(null)
        }}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>ยืนยันการลบ Work Item</AlertDialogTitle>
              <AlertDialogDescription>
                ลบ “{deleteItem?.title}” ใช่หรือไม่? ระบบจะปฏิเสธการลบหากมี Daily Work หรือ GitLab Issue identity ผูกอยู่ เพื่อรักษาประวัติ
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={isDeleting}>ยกเลิก</AlertDialogCancel>
              <AlertDialogAction
                disabled={isDeleting}
                onClick={(event) => {
                  event.preventDefault()
                  return confirmDelete()
                }}
              >
                {isDeleting ? 'กำลังลบ...' : 'ยืนยันลบ Work Item'}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <WorkItemDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          mode={dialogMode}
          initialValues={formValues}
          projects={projects}
          onSaved={refreshAfterMutation}
        />
      </SidebarInset>
    </SidebarProvider>
  )
}
