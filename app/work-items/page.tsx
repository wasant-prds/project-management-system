'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
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
import { Plus, Search } from 'lucide-react'
import { toast } from '@/hooks/use-toast'
import { DEFAULT_ASSIGNEE_ID } from '@/lib/work-items'
import { WorkItemCard } from '@/components/page/work-items/work-item-card'
import { WorkItemViewDialog } from '@/components/page/work-items/work-item-view-dialog'
import {
  MONTH_OPTIONS,
  workItemDateParts,
} from '@/components/page/work-items/work-item-presentation'
import type { ProjectOption, WorkItem } from '@/components/page/work-items/types'
import {
  emptyWorkItemForm,
  WorkItemDialog,
  type WorkItemFormValues,
} from '@/components/page/work-items/work-item-dialog'

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

export default function WorkItemsPage() {
  const [workItems, setWorkItems] = useState<WorkItem[]>([])
  const [projects, setProjects] = useState<ProjectOption[]>([])
  const [users, setUsers] = useState<Array<{ id: string; name: string }>>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [yearFilter, setYearFilter] = useState('all')
  const [monthFilter, setMonthFilter] = useState('all')
  const [projectFilter, setProjectFilter] = useState('all')
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
    const years = new Set<string>()
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

  const stats = {
    total: filtered.length,
    inProgress: filtered.filter((item) => item.status === 'in-progress').length,
    completed: filtered.filter((item) => item.status === 'completed').length,
    overdue: filtered.filter((item) => {
      if (!item.dueDate || item.status === 'completed' || item.status === 'cancelled') return false
      return new Date(item.dueDate) < new Date()
    }).length,
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

  const renderList = (items: WorkItem[]) => {
    if (items.length === 0) {
      return (
        <Card className="card-shadow">
          <CardContent className="py-12 text-center text-muted-foreground">
            No work items match the current filters.
          </CardContent>
        </Card>
      )
    }

    return (
      <div className="space-y-3">
        {items.map((item) => (
          <WorkItemCard
            key={item.id}
            item={item}
            onView={openView}
            onEdit={openEdit}
            onDelete={handleDelete}
          />
        ))}
      </div>
    )
  }

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <AppHeader />
        <main className="flex-1 overflow-y-auto p-6">
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-3xl font-bold tracking-tight text-balance">Work Items</h1>
                <p className="text-muted-foreground mt-1">Incidents, issues, and tasks in one place</p>
              </div>
              <Button className="gap-2" onClick={openCreate}>
                <Plus className="h-4 w-4" />
                New Work Item
              </Button>
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
              </div>
            </div>

            <Tabs defaultValue="all" className="space-y-4">
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
              <TabsContent value="all">{renderList(filtered)}</TabsContent>
              <TabsContent value="Incident">
                {renderList(filtered.filter((item) => item.kind === 'Incident'))}
              </TabsContent>
              <TabsContent value="Issue">
                {renderList(filtered.filter((item) => item.kind === 'Issue'))}
              </TabsContent>
              <TabsContent value="Task">
                {renderList(filtered.filter((item) => item.kind === 'Task'))}
              </TabsContent>
            </Tabs>
          </div>
        </main>

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
