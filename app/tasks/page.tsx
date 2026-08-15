import { AppSidebar } from "@/components/layout/app-sidebar"
import { AppHeader } from "@/components/layout/app-header"
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Checkbox } from "@/components/ui/checkbox"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Plus, Search, Filter, MoreVertical, Calendar, Flag } from "lucide-react"
import { prisma } from "@/lib/db"

async function getTasks() {
  const tasks = await prisma.task.findMany({
    include: {
      assignee: {
        select: {
          name: true,
          avatar: true,
        },
      },
      project: {
        select: {
          name: true,
        },
      },
    },
    orderBy: {
      createdAt: 'desc',
    },
  })

  // Get task statistics
  const stats = {
    total: await prisma.task.count(),
    inProgress: await prisma.task.count({ where: { status: 'In Progress' } }),
    completed: await prisma.task.count({ where: { completed: true } }),
    overdue: await prisma.task.count({
      where: {
        completed: false,
        dueDate: {
          lt: new Date(),
        },
      },
    }),
  }

  return {
    tasks: tasks.map((task) => ({
      id: task.id,
      title: task.title,
      description: task.description,
      status: task.status,
      priority: task.priority,
      assignee: task.assignee
        ? {
            name: task.assignee.name,
            avatar: task.assignee.avatar || task.assignee.name.substring(0, 2).toUpperCase(),
          }
        : { name: 'Unassigned', avatar: 'UN' },
      project: task.project.name,
      dueDate: task.dueDate ? task.dueDate.toISOString().split('T')[0] : 'No due date',
      completed: task.completed,
    })),
    stats,
  }
}

export default async function TasksPage() {
  const { tasks, stats } = await getTasks()

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case "High":
        return "bg-destructive/10 text-destructive border-destructive/20"
      case "Medium":
        return "bg-chart-5/10 text-chart-5 border-chart-5/20"
      case "Low":
        return "bg-chart-1/10 text-chart-1 border-chart-1/20"
      case "Critical":
        return "bg-destructive text-destructive-foreground"
      default:
        return "bg-muted text-muted-foreground"
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case "In Progress":
        return "bg-chart-2/10 text-chart-2 border-chart-2/20"
      case "Review":
        return "bg-chart-4/10 text-chart-4 border-chart-4/20"
      case "To Do":
        return "bg-muted text-muted-foreground border-border"
      case "Completed":
        return "bg-chart-1/10 text-chart-1 border-chart-1/20"
      case "Blocked":
        return "bg-destructive/10 text-destructive border-destructive/20"
      default:
        return "bg-muted text-muted-foreground"
    }
  }

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <AppHeader />
        <main className="flex-1 overflow-y-auto p-6">
          <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-3xl font-bold tracking-tight text-balance">Tasks</h1>
                <p className="text-muted-foreground mt-1">Manage and track all your tasks</p>
              </div>
              <Button className="gap-2">
                <Plus className="h-4 w-4" />
                New Task
              </Button>
            </div>

            {/* Stats */}
            <div className="grid gap-4 md:grid-cols-4">
              <Card className="card-shadow">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium text-muted-foreground">Total Tasks</CardTitle>
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

            {/* Filters and Search */}
            <div className="flex items-center gap-4">
              <div className="relative flex-1 max-w-md">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input type="search" placeholder="Search tasks..." className="pl-10 bg-secondary/50" />
              </div>
              <Button variant="outline" className="gap-2 bg-transparent">
                <Filter className="h-4 w-4" />
                Filter
              </Button>
            </div>

            {/* Tabs */}
            <Tabs defaultValue="all" className="space-y-4">
              <TabsList>
                <TabsTrigger value="all">All Tasks</TabsTrigger>
                <TabsTrigger value="my-tasks">My Tasks</TabsTrigger>
                <TabsTrigger value="in-progress">In Progress</TabsTrigger>
                <TabsTrigger value="completed">Completed</TabsTrigger>
              </TabsList>

              <TabsContent value="all" className="space-y-3">
                {tasks.map((task) => (
                  <Card key={task.id} className="card-shadow hover:border-primary/30 transition-colors">
                    <CardContent className="p-4">
                      <div className="flex items-start gap-4">
                        <Checkbox className="mt-1" checked={task.completed} />
                        <div className="flex-1 space-y-2">
                          <div className="flex items-start justify-between gap-4">
                            <div className="space-y-1 flex-1">
                              <h3 className="font-medium leading-none">{task.title}</h3>
                              <p className="text-sm text-muted-foreground">{task.description}</p>
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
                                <DropdownMenuItem>Edit Task</DropdownMenuItem>
                                <DropdownMenuItem>Change Status</DropdownMenuItem>
                                <DropdownMenuItem>Assign to</DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem className="text-destructive">Delete Task</DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>

                          <div className="flex items-center gap-4 flex-wrap">
                            <Badge variant="outline" className={getStatusColor(task.status)}>
                              {task.status}
                            </Badge>
                            <Badge variant="outline" className={getPriorityColor(task.priority)}>
                              <Flag className="h-3 w-3 mr-1" />
                              {task.priority}
                            </Badge>
                            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                              <Calendar className="h-3 w-3" />
                              <span>{task.dueDate}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <Avatar className="h-6 w-6 border border-primary/20">
                                <AvatarFallback className="bg-primary/10 text-primary text-xs">
                                  {task.assignee.avatar}
                                </AvatarFallback>
                              </Avatar>
                              <span className="text-sm text-muted-foreground">{task.assignee.name}</span>
                            </div>
                            <span className="text-sm text-muted-foreground">{task.project}</span>
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </TabsContent>

              <TabsContent value="in-progress">
                <div className="space-y-3">
                  {tasks
                    .filter((t) => t.status === "In Progress")
                    .map((task) => (
                      <Card key={task.id} className="card-shadow">
                        <CardContent className="p-4">
                          <h3 className="font-medium">{task.title}</h3>
                          <p className="text-sm text-muted-foreground mt-1">{task.description}</p>
                        </CardContent>
                      </Card>
                    ))}
                </div>
              </TabsContent>

              <TabsContent value="completed">
                <div className="space-y-3">
                  {tasks
                    .filter((t) => t.completed)
                    .map((task) => (
                      <Card key={task.id} className="card-shadow">
                        <CardContent className="p-4">
                          <h3 className="font-medium line-through text-muted-foreground">{task.title}</h3>
                          <p className="text-sm text-muted-foreground mt-1">{task.description}</p>
                        </CardContent>
                      </Card>
                    ))}
                </div>
              </TabsContent>
            </Tabs>
          </div>
        </main>
      </SidebarInset>
    </SidebarProvider>
  )
}
