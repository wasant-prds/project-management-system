'use client'

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
import { WorkItemViewDialog } from '@/components/page/work-items/work-item-view-dialog'
import { WorkItemGroupedList } from '@/components/page/work-items/work-item-grouped-list'
import { GitLabImportPanel } from '@/components/page/work-items/gitlab-import-panel'
import {
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
  search: string
  status: string
  priority: string
  role: string
  includeYears: boolean
  page?: { limit?: number; cursor?: string | null }
}

function workItemQuery({
  year,
  month,
  project,
  search,
  status,
  priority,
  role,
  includeYears,
  page,
}: WorkItemQueryOptions) {
  const params = new URLSearchParams({ year, month })
  params.set('limit', String(page?.limit ?? 50))
  if (project !== 'all') params.set('projectId', project)
  if (search.trim()) params.set('search', search.trim())
  if (status !== 'all') params.set('status', status)
  if (priority !== 'all') params.set('priority', priority)
  if (role !== 'all') params.set('role', role)
  if (includeYears) params.set('includeYears', 'true')
  if (page?.cursor) params.set('cursor', page.cursor)
  return params.toString()
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
  const [workItems, setWorkItems] = useState<WorkItem[]>([])
  const [workItemSummary, setWorkItemSummary] = useState<WorkItemSummary | null>(null)
  const [projects, setProjects] = useState<ProjectOption[]>([])
  const [availableYears, setAvailableYears] = useState<string[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('')
  const [yearFilter, setYearFilter] = useState(() => currentBangkokCalendarDate().slice(0, 4))
  const [monthFilter, setMonthFilter] = useState('all')
  const [projectFilter, setProjectFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [priorityFilter, setPriorityFilter] = useState('all')
  const [roleFilter, setRoleFilter] = useState('all')
  const [kindTab, setKindTab] = useState<KindTab>('all')
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

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearchQuery(searchQuery), 250)
    return () => clearTimeout(timer)
  }, [searchQuery])

  const load = useCallback(async () => {
    const generation = ++loadGenerationRef.current
    const filterKey = [yearFilter, monthFilter, projectFilter, statusFilter, priorityFilter, roleFilter, debouncedSearchQuery.trim()].join('|')
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
        search: debouncedSearchQuery,
        status: statusFilter,
        priority: priorityFilter,
        role: roleFilter,
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
  }, [yearFilter, monthFilter, projectFilter, statusFilter, priorityFilter, roleFilter, debouncedSearchQuery])

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
        search: debouncedSearchQuery,
        status: statusFilter,
        priority: priorityFilter,
        role: roleFilter,
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
  }, [nextCursor, isLoadingMore, yearFilter, monthFilter, projectFilter, debouncedSearchQuery, statusFilter, priorityFilter, roleFilter])

  useEffect(() => {
    void load()
  }, [load])

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

  const yearOptions = useMemo(() => {
    const years = new Set<string>([currentBangkokCalendarDate().slice(0, 4), ...availableYears])
    return [...years].sort((left, right) => Number(right) - Number(left))
  }, [availableYears])

  const filtered = useMemo(() => {
    const query = debouncedSearchQuery.trim().toLowerCase()
    return workItems.filter((item) => {
      if (projectFilter !== 'all' && item.project.id !== projectFilter) return false
      if (!matchesYearMonth(item, yearFilter, monthFilter)) return false
      if (statusFilter !== 'all' && item.status !== statusFilter) return false
      if (priorityFilter !== 'all' && item.priority !== priorityFilter) return false
      if (roleFilter === 'none' && item.role !== null) return false
      if (roleFilter !== 'all' && roleFilter !== 'none' && item.role !== roleFilter) return false
      if (!query) return true
      return [
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
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query))
    })
  }, [workItems, debouncedSearchQuery, yearFilter, monthFilter, projectFilter, statusFilter, priorityFilter, roleFilter])

  const visibleGroups = useMemo(() => {
    const scoped = kindTab === 'all' ? filtered : filtered.filter((item) => item.kind === kindTab)
    return groupWorkItems(scoped, sortMode)
  }, [filtered, kindTab, sortMode])

  const visibleItems = useMemo(() => flattenProjectGroups(visibleGroups), [visibleGroups])

  const expandResetKey = [
    yearFilter,
    monthFilter,
    projectFilter,
    statusFilter,
    priorityFilter,
    roleFilter,
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
    let cursor: string | null = null
    const seenCursors = new Set<string>()
    do {
      const query = workItemQuery({
        year: yearFilter,
        month: monthFilter,
        project: projectFilter,
        search: debouncedSearchQuery,
        status: statusFilter,
        priority: priorityFilter,
        role: roleFilter,
        includeYears: false,
        page: { limit: 200, cursor },
      })
      const response = await fetch(`/api/work-items?${query}`)
      const data = await response.json()
      if (!response.ok) throw new Error(data.error?.message || data.error || 'Failed to export work items')
      allItems.push(...(data.workItems || []))
      cursor = data.page?.nextCursor ?? null
      if (cursor && seenCursors.has(cursor)) throw new Error('Work Item export cursor repeated')
      if (cursor) seenCursors.add(cursor)
    } while (cursor)

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

  const filterKey = [yearFilter, monthFilter, projectFilter, statusFilter, priorityFilter, roleFilter, debouncedSearchQuery.trim()].join('|')
  const resultsAreCurrent = loadedFilterKey === filterKey
  const isListLoading = loadingFilterKey === filterKey || (!resultsAreCurrent && !loadError)

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
    listContent = <output className="rounded-lg border bg-card py-12 text-center text-muted-foreground">Loading work items…</output>
  } else if (loadError && !resultsAreCurrent) {
    listContent = <div className="rounded-lg border bg-card py-12 text-center text-destructive" role="alert">{loadError}</div>
  }

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <AppHeader />
        <div className={PAGE_MAIN}>
          <div className={PAGE_INNER}>
            <div className={PAGE_TOOLBAR}>
              <div className="min-w-0">
                <h1 className={PAGE_HEADING}>Work Items</h1>
                <p className={PAGE_LEAD}>
                  Incidents, issues, and tasks in one place
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
                <Button onClick={openCreate}>
                  <Plus className="h-4 w-4" />
                  <span className="sm:hidden">New</span>
                  <span className="hidden sm:inline">New Work Item</span>
                </Button>
              </div>
            </div>

            {importReport && (
              <section className="space-y-2 rounded-lg border bg-card p-3 text-sm" aria-live="polite">
                <p className="font-medium">
                  {importReport.filename}: เพิ่ม {importReport.imported} · ข้าม {importReport.skipped} · ผิดพลาด {importReport.failed}
                </p>
                {importReport.rowMessages.length > 0 && (
                  <ul className="max-h-40 space-y-1 overflow-y-auto text-destructive" aria-label="Import row results">
                    {importReport.rowMessages.map((message, index) => <li key={`${index}-${message}`}>{message}</li>)}
                  </ul>
                )}
              </section>
            )}

            <GitLabImportPanel projects={projects} onSynced={refreshAfterMutation} />

            <div className={STAT_GRID}>
              <SummaryStatCard label="Total" value={stats.total} />
              <SummaryStatCard
                label="In Progress"
                value={stats.inProgress}
                valueClassName="text-chart-2"
              />
              <SummaryStatCard
                label="Completed"
                value={stats.completed}
                valueClassName="text-chart-1"
              />
              <SummaryStatCard
                label="Overdue"
                value={stats.overdue}
                valueClassName="text-destructive"
              />
            </div>

            <div className={FILTER_ROW}>
              <div className="relative w-full max-w-none flex-1 sm:max-w-md">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  type="search"
                  placeholder="Search work items..."
                  className="bg-secondary/50 pl-10"
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                />
              </div>
              <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto sm:flex-wrap">
                <Select value={yearFilter} onValueChange={setYearFilter}>
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
                <Select value={monthFilter} onValueChange={setMonthFilter}>
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
                if (isKindTab(value)) setKindTab(value)
              }}
              className="space-y-4"
            >
              <div className={TAB_SCROLL_CLASS}>
                <TabsList>
                  <TabsTrigger className={TAB_TRIGGER_CLASS} value="all">
                    All ({workItemSummary?.total ?? filtered.length})
                  </TabsTrigger>
                  <TabsTrigger className={TAB_TRIGGER_CLASS} value="Incident">
                    Incidents ({workItemSummary?.kinds.Incident ?? filtered.filter((item) => item.kind === 'Incident').length})
                  </TabsTrigger>
                  <TabsTrigger className={TAB_TRIGGER_CLASS} value="Issue">
                    Issues ({workItemSummary?.kinds.Issue ?? filtered.filter((item) => item.kind === 'Issue').length})
                  </TabsTrigger>
                  <TabsTrigger className={TAB_TRIGGER_CLASS} value="Task">
                    Tasks ({workItemSummary?.kinds.Task ?? filtered.filter((item) => item.kind === 'Task').length})
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
        </div>

        <WorkItemViewDialog
          open={Boolean(viewItem)}
          item={viewItem}
          isLoading={viewLoading}
          onOpenChange={(open) => {
            if (!open) {
              viewGenerationRef.current += 1
              setViewLoading(false)
              setViewItem(null)
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
