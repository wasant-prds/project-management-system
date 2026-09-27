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
import { DEFAULT_ASSIGNEE_ID, type WorkItemKindValue } from '@/lib/work-items'
import { WorkItemViewDialog } from '@/components/page/work-items/work-item-view-dialog'
import { WorkItemGroupedList } from '@/components/page/work-items/work-item-grouped-list'
import {
  MONTH_OPTIONS,
  workItemDateParts,
} from '@/components/page/work-items/work-item-presentation'
import {
  DEFAULT_WORK_ITEM_SORT_MODE,
  downloadTextFile,
  flattenProjectGroups,
  generateWorkItemsCsv,
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

const SORT_MENU_CLOSE_DELAY_MS = 150

type KindTab = 'all' | WorkItemKindValue

function isKindTab(value: string): value is KindTab {
  return value === 'all' || value === 'Incident' || value === 'Issue' || value === 'Task'
}

function toDateInput(value: string | null) {
  return value ? value.slice(0, 10) : ''
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
    assigneeId: item.assignee.id || DEFAULT_ASSIGNEE_ID,
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
  const [projects, setProjects] = useState<ProjectOption[]>([])
  const [availableYears, setAvailableYears] = useState<string[]>([])
  const [users, setUsers] = useState<Array<{ id: string; name: string }>>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('')
  const [yearFilter, setYearFilter] = useState(() => String(new Date().getFullYear()))
  const [monthFilter, setMonthFilter] = useState('all')
  const [projectFilter, setProjectFilter] = useState('all')
  const [kindTab, setKindTab] = useState<KindTab>('all')
  const [sortMode, setSortMode] = useState<WorkItemSortMode>(DEFAULT_WORK_ITEM_SORT_MODE)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [dialogMode, setDialogMode] = useState<'create' | 'edit'>('create')
  const [formValues, setFormValues] = useState<WorkItemFormValues>(emptyWorkItemForm())
  const [viewItem, setViewItem] = useState<WorkItem | null>(null)
  const [isImporting, setIsImporting] = useState(false)
  const importInputRef = useRef<HTMLInputElement>(null)
  const yearOptionsLoadedRef = useRef(false)
  const projectsLoadedRef = useRef(false)
  const projectsRequestRef = useRef<Promise<ProjectOption[]> | null>(null)
  const usersLoadedRef = useRef(false)
  const usersRequestRef = useRef<Promise<Array<{ id: string; name: string }>> | null>(null)
  const loadGenerationRef = useRef(0)
  const loadControllerRef = useRef<AbortController | null>(null)
  const [loadedFilterKey, setLoadedFilterKey] = useState<string | null>(null)
  const [loadingFilterKey, setLoadingFilterKey] = useState<string | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearchQuery(searchQuery), 250)
    return () => clearTimeout(timer)
  }, [searchQuery])

  const load = useCallback(async () => {
    const generation = ++loadGenerationRef.current
    const filterKey = [yearFilter, monthFilter, projectFilter, debouncedSearchQuery.trim()].join('|')
    loadControllerRef.current?.abort()
    const controller = new AbortController()
    loadControllerRef.current = controller
    setLoadingFilterKey(filterKey)
    setLoadedFilterKey(null)
    setWorkItems([])
    setLoadError(null)

    const params = new URLSearchParams({ year: yearFilter, month: monthFilter })
    if (projectFilter !== 'all') params.set('projectId', projectFilter)
    if (debouncedSearchQuery.trim()) params.set('search', debouncedSearchQuery.trim())
    if (!yearOptionsLoadedRef.current) params.set('includeYears', 'true')

    try {
      const response = await fetch(`/api/work-items?${params.toString()}`, { signal: controller.signal })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Failed to load work items')
      if (generation !== loadGenerationRef.current) return

      setWorkItems(data.workItems || [])
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
  }, [yearFilter, monthFilter, projectFilter, debouncedSearchQuery])

  useEffect(() => {
    void load()
  }, [load])

  const ensureProjectsLoaded = useCallback(async () => {
    if (projectsLoadedRef.current) return true

    try {
      if (!projectsRequestRef.current) {
        projectsRequestRef.current = fetch('/api/projects?options=work-items').then(async (response) => {
          const data = await response.json()
          if (!response.ok) throw new Error(data.error || 'Failed to load projects')
          return (data.projects || []) as ProjectOption[]
        })
      }
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

  const ensureUsersLoaded = useCallback(async () => {
    if (usersLoadedRef.current) return true

    try {
      if (!usersRequestRef.current) {
        usersRequestRef.current = fetch('/api/users').then(async (response) => {
          const data = await response.json()
          if (!response.ok) throw new Error(data.error || 'Failed to load users')
          return (data.users || []).map((user: { id: string; name: string }) => ({
            id: user.id,
            name: user.name,
          }))
        })
      }
      const nextUsers = await usersRequestRef.current
      setUsers(nextUsers)
      usersLoadedRef.current = true
      return true
    } catch (error) {
      console.error(error)
      toast({ title: 'Error', description: 'Failed to load users', variant: 'destructive' })
      return false
    } finally {
      usersRequestRef.current = null
    }
  }, [])

  const yearOptions = useMemo(() => {
    const years = new Set<string>([String(new Date().getFullYear()), ...availableYears])
    return [...years].sort((left, right) => Number(right) - Number(left))
  }, [availableYears])

  const filtered = useMemo(() => {
    const query = debouncedSearchQuery.trim().toLowerCase()
    return workItems.filter((item) => {
      if (projectFilter !== 'all' && item.project.id !== projectFilter) return false
      if (!matchesYearMonth(item, yearFilter, monthFilter)) return false
      if (!query) return true
      return [item.title, item.description, item.project.name, item.assignee.name, item.kind, item.status]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query))
    })
  }, [workItems, debouncedSearchQuery, yearFilter, monthFilter, projectFilter])

  const visibleGroups = useMemo(() => {
    const scoped = kindTab === 'all' ? filtered : filtered.filter((item) => item.kind === kindTab)
    return groupWorkItems(scoped, sortMode)
  }, [filtered, kindTab, sortMode])

  const visibleItems = useMemo(() => flattenProjectGroups(visibleGroups), [visibleGroups])

  const expandResetKey = [
    yearFilter,
    monthFilter,
    projectFilter,
    searchQuery.trim(),
    kindTab,
    sortMode,
  ].join('|')

  const stats = {
    total: filtered.length,
    inProgress: filtered.filter((item) => item.status === 'in-progress').length,
    completed: filtered.filter((item) => item.status === 'completed').length,
    overdue: filtered.filter((item) => urgencySubgroup(item) === 'overdue').length,
  }

  const openCreate = async () => {
    const [usersReady, projectsReady] = await Promise.all([ensureUsersLoaded(), ensureProjectsLoaded()])
    if (!usersReady || !projectsReady) return
    setViewItem(null)
    setDialogMode('create')
    setFormValues(emptyWorkItemForm())
    setDialogOpen(true)
  }

  const openView = (item: WorkItem) => {
    setViewItem(item)
  }

  const openEdit = async (item: WorkItem) => {
    const [usersReady, projectsReady] = await Promise.all([ensureUsersLoaded(), ensureProjectsLoaded()])
    if (!usersReady || !projectsReady) return
    setViewItem(null)
    setDialogMode('edit')
    setFormValues(toFormValues(item))
    setDialogOpen(true)
  }

  const handleDelete = async (item: WorkItem) => {
    if (!confirm(`Delete "${item.title}"?`)) return
    const response = await fetch(`/api/work-items/${item.id}`, { method: 'DELETE' })
    if (!response.ok) {
      toast({ title: 'Error', description: 'Failed to delete work item', variant: 'destructive' })
      return
    }
    setViewItem(null)
    toast({ title: 'Deleted', description: 'Work item removed' })
    load()
  }

  const exportFilename = (extension: 'csv' | 'md') => {
    const date = new Date().toISOString().slice(0, 10)
    const kind = kindTab === 'all' ? 'all' : kindTab.toLowerCase()
    return `work_items_${kind}_${date}.${extension}`
  }

  const exportCsv = () => {
    if (visibleItems.length === 0) return
    downloadTextFile(
      generateWorkItemsCsv(visibleItems),
      exportFilename('csv'),
      'text/csv;charset=utf-8;',
    )
  }

  const exportMarkdown = () => {
    if (visibleItems.length === 0) return
    downloadTextFile(
      generateWorkItemsMarkdown(visibleItems, sortMode),
      exportFilename('md'),
      'text/markdown;charset=utf-8;',
    )
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
    try {
      const response = await fetch('/api/work-items/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(rows),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Failed to import work items')

      toast({
        title: 'Import complete',
        description: `${data.imported} work items imported from ${file.name}.`,
      })
      await load()
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

  const filterKey = [yearFilter, monthFilter, projectFilter, debouncedSearchQuery.trim()].join('|')
  const resultsAreCurrent = loadedFilterKey === filterKey
  const isListLoading = loadingFilterKey === filterKey || (!resultsAreCurrent && !loadError)

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
                <Button onClick={openCreate}>
                  <Plus className="h-4 w-4" />
                  <span className="sm:hidden">New</span>
                  <span className="hidden sm:inline">New Work Item</span>
                </Button>
              </div>
            </div>

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
                    All ({filtered.length})
                  </TabsTrigger>
                  <TabsTrigger className={TAB_TRIGGER_CLASS} value="Incident">
                    Incidents ({filtered.filter((item) => item.kind === 'Incident').length})
                  </TabsTrigger>
                  <TabsTrigger className={TAB_TRIGGER_CLASS} value="Issue">
                    Issues ({filtered.filter((item) => item.kind === 'Issue').length})
                  </TabsTrigger>
                  <TabsTrigger className={TAB_TRIGGER_CLASS} value="Task">
                    Tasks ({filtered.filter((item) => item.kind === 'Task').length})
                  </TabsTrigger>
                </TabsList>
              </div>
              <TabsContent value={kindTab}>
                {isListLoading ? (
                  <div className="rounded-lg border bg-card py-12 text-center text-muted-foreground" role="status">
                    Loading work items…
                  </div>
                ) : loadError && !resultsAreCurrent ? (
                  <div className="rounded-lg border bg-card py-12 text-center text-destructive" role="alert">
                    {loadError}
                  </div>
                ) : (
                  <WorkItemGroupedList
                    groups={visibleGroups}
                    resetKey={expandResetKey}
                    onView={openView}
                    onEdit={openEdit}
                    onDelete={handleDelete}
                  />
                )}
              </TabsContent>
            </Tabs>
          </div>
        </div>

        <WorkItemViewDialog
          open={Boolean(viewItem)}
          item={viewItem}
          onOpenChange={(open) => {
            if (!open) setViewItem(null)
          }}
          onEdit={openEdit}
        />

        <WorkItemDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          mode={dialogMode}
          initialValues={formValues}
          projects={projects}
          users={users}
          onSaved={load}
        />
      </SidebarInset>
    </SidebarProvider>
  )
}
