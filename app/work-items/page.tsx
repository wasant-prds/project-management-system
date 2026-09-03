'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AppSidebar } from '@/components/layout/app-sidebar'
import { AppHeader } from '@/components/layout/app-header'
import { SidebarProvider, SidebarInset } from '@/components/ui/sidebar'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
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
import { ArrowUpDown, Download, FileText, Plus, Search } from 'lucide-react'
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
          className="gap-2 bg-secondary/50"
          aria-label="Sort work items"
          onMouseEnter={openMenu}
          onMouseLeave={scheduleClose}
        >
          <ArrowUpDown className="h-4 w-4" />
          {WORK_ITEM_SORT_LABELS[value]}
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
  const [users, setUsers] = useState<Array<{ id: string; name: string }>>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [yearFilter, setYearFilter] = useState(() => String(new Date().getFullYear()))
  const [monthFilter, setMonthFilter] = useState('all')
  const [projectFilter, setProjectFilter] = useState('all')
  const [kindTab, setKindTab] = useState<KindTab>('all')
  const [sortMode, setSortMode] = useState<WorkItemSortMode>(DEFAULT_WORK_ITEM_SORT_MODE)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [dialogMode, setDialogMode] = useState<'create' | 'edit'>('create')
  const [formValues, setFormValues] = useState<WorkItemFormValues>(emptyWorkItemForm())
  const [viewItem, setViewItem] = useState<WorkItem | null>(null)

  const load = useCallback(async () => {
    try {
      const [itemsRes, projectsRes, usersRes] = await Promise.all([
        fetch('/api/work-items'),
        fetch('/api/projects'),
        fetch('/api/users'),
      ])
      const itemsData = await itemsRes.json()
      const projectsData = await projectsRes.json()
      const usersData = await usersRes.json()
      if (itemsRes.ok) setWorkItems(itemsData.workItems || [])
      if (projectsRes.ok) setProjects(projectsData.projects || [])
      if (usersRes.ok) setUsers(usersData.users || [])
    } catch (error) {
      console.error(error)
      toast({
        title: 'Error',
        description: 'Failed to load work items',
        variant: 'destructive',
      })
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const yearOptions = useMemo(() => {
    const years = new Set<string>([String(new Date().getFullYear())])
    for (const item of workItems) {
      const parts = workItemDateParts(item)
      if (parts) years.add(parts.year)
    }
    return [...years].sort((left, right) => Number(right) - Number(left))
  }, [workItems])

  const filtered = useMemo(() => {
    const query = searchQuery.trim().toLowerCase()
    return workItems.filter((item) => {
      if (projectFilter !== 'all' && item.project.id !== projectFilter) return false
      if (!matchesYearMonth(item, yearFilter, monthFilter)) return false
      if (!query) return true
      return [item.title, item.description, item.project.name, item.assignee.name, item.kind, item.status]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query))
    })
  }, [workItems, searchQuery, yearFilter, monthFilter, projectFilter])

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

  const openCreate = () => {
    setViewItem(null)
    setDialogMode('create')
    setFormValues(emptyWorkItemForm())
    setDialogOpen(true)
  }

  const openView = (item: WorkItem) => {
    setViewItem(item)
  }

  const openEdit = (item: WorkItem) => {
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

  return (
    <SidebarProvider className="h-svh min-h-0 overflow-hidden">
      <AppSidebar />
      <SidebarInset className="min-h-0 overflow-hidden">
        <AppHeader />
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          <div className="space-y-6 p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h1 className="text-3xl font-bold tracking-tight text-balance">Work Items</h1>
                <p className="text-muted-foreground mt-1">Incidents, issues, and tasks in one place</p>
              </div>
              <div className="flex flex-wrap items-center justify-end gap-2">
                <Button
                  variant="default"
                  className="gap-2 bg-blue-500 text-white hover:bg-blue-600"
                  onClick={exportCsv}
                  disabled={visibleItems.length === 0}
                >
                  <Download className="h-4 w-4" />
                  Export CSV
                </Button>
                <Button
                  variant="default"
                  className="gap-2 bg-emerald-600 text-white hover:bg-emerald-700"
                  onClick={exportMarkdown}
                  disabled={visibleItems.length === 0}
                >
                  <FileText className="h-4 w-4" />
                  Export Markdown
                </Button>
                <Button className="gap-2" onClick={openCreate}>
                  <Plus className="h-4 w-4" />
                  New Work Item
                </Button>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-4">
              <Card className="card-shadow">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium text-muted-foreground">Total</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{stats.total}</div>
                </CardContent>
              </Card>
              <Card className="card-shadow">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium text-muted-foreground">In Progress</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-chart-2">{stats.inProgress}</div>
                </CardContent>
              </Card>
              <Card className="card-shadow">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium text-muted-foreground">Completed</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-chart-1">{stats.completed}</div>
                </CardContent>
              </Card>
              <Card className="card-shadow">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium text-muted-foreground">Overdue</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-destructive">{stats.overdue}</div>
                </CardContent>
              </Card>
            </div>

            <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
              <div className="relative max-w-md flex-1">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  type="search"
                  placeholder="Search work items..."
                  className="bg-secondary/50 pl-10"
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                />
              </div>
              <div className="flex flex-wrap gap-2">
                <Select value={yearFilter} onValueChange={setYearFilter}>
                  <SelectTrigger className="w-[130px] bg-secondary/50">
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
                  <SelectTrigger className="w-[150px] bg-secondary/50">
                    <SelectValue placeholder="Month" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All months</SelectItem>
                    {MONTH_OPTIONS.map((month) => (
                      <SelectItem key={month.value} value={month.value}>{month.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={projectFilter} onValueChange={setProjectFilter}>
                  <SelectTrigger className="w-[220px] bg-secondary/50">
                    <SelectValue placeholder="Project" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All projects</SelectItem>
                    {projects.map((project) => (
                      <SelectItem key={project.id} value={project.id}>{project.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <WorkItemSortMenu value={sortMode} onChange={setSortMode} />
              </div>
            </div>

            <Tabs
              value={kindTab}
              onValueChange={(value) => {
                if (isKindTab(value)) setKindTab(value)
              }}
              className="space-y-4"
            >
              <TabsList>
                <TabsTrigger value="all">All ({filtered.length})</TabsTrigger>
                <TabsTrigger value="Incident">
                  Incidents ({filtered.filter((item) => item.kind === 'Incident').length})
                </TabsTrigger>
                <TabsTrigger value="Issue">
                  Issues ({filtered.filter((item) => item.kind === 'Issue').length})
                </TabsTrigger>
                <TabsTrigger value="Task">
                  Tasks ({filtered.filter((item) => item.kind === 'Task').length})
                </TabsTrigger>
              </TabsList>
              <TabsContent value={kindTab}>
                <WorkItemGroupedList
                  groups={visibleGroups}
                  resetKey={expandResetKey}
                  onView={openView}
                  onEdit={openEdit}
                  onDelete={handleDelete}
                />
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
