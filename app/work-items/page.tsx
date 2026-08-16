'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { AppSidebar } from '@/components/layout/app-sidebar'
import { AppHeader } from '@/components/layout/app-header'
import { SidebarProvider, SidebarInset } from '@/components/ui/sidebar'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Plus, Search, MoreVertical, Calendar, Flag } from 'lucide-react'
import { toast } from '@/hooks/use-toast'
import {
  DEFAULT_ASSIGNEE_ID,
  WORK_ITEM_PRIORITY_LABELS,
  WORK_ITEM_ROLE_LABELS,
  WORK_ITEM_STATUS_LABELS,
  type WorkItemKindValue,
  type WorkItemPriorityValue,
  type WorkItemRoleValue,
  type WorkItemStatusValue,
} from '@/lib/work-items'
import {
  emptyWorkItemForm,
  WorkItemDialog,
  type WorkItemFormValues,
} from '@/components/page/work-items/work-item-dialog'

type WorkItem = {
  id: string
  title: string
  description: string | null
  kind: WorkItemKindValue
  priority: WorkItemPriorityValue
  role: WorkItemRoleValue | null
  status: WorkItemStatusValue
  types: string[]
  workDate: string | null
  dueDate: string | null
  submittedAt: string | null
  project: { id: string; name: string }
  assignee: { id: string; name: string; avatar: string | null }
}

function toDateInput(value: string | null) {
  return value ? value.slice(0, 10) : ''
}

function formatDisplayDate(value: string | null) {
  return value ? value.slice(0, 10) : '—'
}

function priorityClass(priority: WorkItemPriorityValue) {
  switch (priority) {
    case 'urgent':
      return 'bg-destructive text-destructive-foreground'
    case 'high':
      return 'bg-destructive/10 text-destructive border-destructive/20'
    case 'medium':
      return 'bg-chart-5/10 text-chart-5 border-chart-5/20'
    case 'low':
      return 'bg-chart-1/10 text-chart-1 border-chart-1/20'
    default:
      return 'bg-muted text-muted-foreground'
  }
}

function statusClass(status: WorkItemStatusValue) {
  switch (status) {
    case 'in-progress':
      return 'bg-chart-2/10 text-chart-2 border-chart-2/20'
    case 'sa-testing':
    case 'pm-testing':
      return 'bg-chart-4/10 text-chart-4 border-chart-4/20'
    case 'completed':
      return 'bg-chart-1/10 text-chart-1 border-chart-1/20'
    case 'blocked':
    case 'cancelled':
      return 'bg-destructive/10 text-destructive border-destructive/20'
    default:
      return 'bg-muted text-muted-foreground border-border'
  }
}

function kindClass(kind: WorkItemKindValue) {
  switch (kind) {
    case 'Incident':
      return 'bg-destructive/10 text-destructive border-destructive/20'
    case 'Issue':
      return 'bg-chart-5/10 text-chart-5 border-chart-5/20'
    default:
      return 'bg-chart-2/10 text-chart-2 border-chart-2/20'
  }
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

export default function WorkItemsPage() {
  const [workItems, setWorkItems] = useState<WorkItem[]>([])
  const [projects, setProjects] = useState<Array<{ id: string; name: string }>>([])
  const [users, setUsers] = useState<Array<{ id: string; name: string }>>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [dialogMode, setDialogMode] = useState<'create' | 'edit'>('create')
  const [formValues, setFormValues] = useState<WorkItemFormValues>(emptyWorkItemForm())

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

  const filtered = useMemo(() => {
    const query = searchQuery.trim().toLowerCase()
    if (!query) return workItems
    return workItems.filter((item) =>
      [item.title, item.description, item.project.name, item.assignee.name, item.kind, item.status]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query)),
    )
  }, [workItems, searchQuery])

  const stats = {
    total: workItems.length,
    inProgress: workItems.filter((item) => item.status === 'in-progress').length,
    completed: workItems.filter((item) => item.status === 'completed').length,
    overdue: workItems.filter((item) => {
      if (!item.dueDate || item.status === 'completed' || item.status === 'cancelled') return false
      return new Date(item.dueDate) < new Date()
    }).length,
  }

  const openCreate = () => {
    setDialogMode('create')
    setFormValues(emptyWorkItemForm())
    setDialogOpen(true)
  }

  const openEdit = (item: WorkItem) => {
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
    toast({ title: 'Deleted', description: 'Work item removed' })
    load()
  }

  const renderList = (items: WorkItem[]) => {
    if (items.length === 0) {
      return (
        <Card className="card-shadow">
          <CardContent className="py-12 text-center text-muted-foreground">
            No work items yet. Create one to get started.
          </CardContent>
        </Card>
      )
    }

    return (
      <div className="space-y-3">
        {items.map((item) => (
          <Card key={item.id} className="card-shadow hover:border-primary/30 transition-colors">
            <CardContent className="p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-2 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-medium leading-none">{item.title}</h3>
                    <Badge variant="outline" className={kindClass(item.kind)}>{item.kind}</Badge>
                  </div>
                  {item.description && (
                    <p className="text-sm text-muted-foreground">{item.description}</p>
                  )}
                  <div className="flex items-center gap-3 flex-wrap">
                    <Badge variant="outline" className={statusClass(item.status)}>
                      {WORK_ITEM_STATUS_LABELS[item.status]}
                    </Badge>
                    <Badge variant="outline" className={priorityClass(item.priority)}>
                      <Flag className="h-3 w-3 mr-1" />
                      {WORK_ITEM_PRIORITY_LABELS[item.priority]}
                    </Badge>
                    {item.role && (
                      <Badge variant="outline">{WORK_ITEM_ROLE_LABELS[item.role]}</Badge>
                    )}
                    {item.types.map((type) => (
                      <Badge key={type} variant="secondary">{type}</Badge>
                    ))}
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Calendar className="h-3 w-3" />
                      <span>Due {formatDisplayDate(item.dueDate)}</span>
                    </div>
                    {item.submittedAt && (
                      <span className="text-sm text-muted-foreground">
                        Submitted {formatDisplayDate(item.submittedAt)}
                      </span>
                    )}
                    <div className="flex items-center gap-2">
                      <Avatar className="h-6 w-6 border border-primary/20">
                        <AvatarFallback className="bg-primary/10 text-primary text-xs">
                          {(item.assignee.avatar || item.assignee.name).slice(0, 2)}
                        </AvatarFallback>
                      </Avatar>
                      <span className="text-sm text-muted-foreground">{item.assignee.name}</span>
                    </div>
                    <span className="text-sm text-muted-foreground">{item.project.name}</span>
                  </div>
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-8 w-8 flex-shrink-0">
                      <MoreVertical className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuLabel>Actions</DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => openEdit(item)}>Edit</DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem className="text-destructive" onClick={() => handleDelete(item)}>
                      Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </CardContent>
          </Card>
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

            <div className="relative max-w-md">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                type="search"
                placeholder="Search work items..."
                className="pl-10 bg-secondary/50"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
              />
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
