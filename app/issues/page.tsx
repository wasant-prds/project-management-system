import { AppSidebar } from "@/components/layout/app-sidebar"
import { AppHeader } from "@/components/layout/app-header"
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Plus, Search, Filter, MoreVertical, AlertCircle, Bug, AlertTriangle, Info, MessageSquare } from "lucide-react"
import { prisma } from "@/lib/db"

async function getIssues() {
  const issues = await prisma.issue.findMany({
    include: {
      reporter: {
        select: {
          name: true,
          avatar: true,
        },
      },
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
      _count: {
        select: {
          comments: true,
        },
      },
    },
    orderBy: {
      createdAt: 'desc',
    },
  })

  // Get issue statistics
  const stats = {
    total: await prisma.issue.count(),
    open: await prisma.issue.count({ where: { status: 'Open' } }),
    inProgress: await prisma.issue.count({ where: { status: 'In Progress' } }),
    resolved: await prisma.issue.count({ where: { status: 'Resolved' } }),
  }

  return {
    issues: issues.map((issue) => ({
      id: issue.id,
      title: issue.title,
      description: issue.description,
      status: issue.status,
      priority: issue.priority,
      type: issue.type,
      reporter: issue.reporter
        ? {
            name: issue.reporter.name,
            avatar: issue.reporter.avatar || issue.reporter.name.substring(0, 2).toUpperCase(),
          }
        : { name: 'Unknown', avatar: 'UK' },
      assignee: issue.assignee
        ? {
            name: issue.assignee.name,
            avatar: issue.assignee.avatar || issue.assignee.name.substring(0, 2).toUpperCase(),
          }
        : { name: 'Unassigned', avatar: 'UN' },
      project: issue.project.name,
      createdAt: issue.createdAt.toISOString().split('T')[0],
      comments: issue._count.comments,
    })),
    stats,
  }
}

export default async function IssuesPage() {
  const { issues, stats } = await getIssues()

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case "Critical":
        return "bg-destructive text-destructive-foreground"
      case "High":
        return "bg-destructive/10 text-destructive border-destructive/20"
      case "Medium":
        return "bg-chart-5/10 text-chart-5 border-chart-5/20"
      case "Low":
        return "bg-chart-1/10 text-chart-1 border-chart-1/20"
      default:
        return "bg-muted text-muted-foreground"
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case "Open":
        return "bg-chart-1/10 text-chart-1 border-chart-1/20"
      case "In Progress":
        return "bg-chart-2/10 text-chart-2 border-chart-2/20"
      case "Resolved":
        return "bg-chart-4/10 text-chart-4 border-chart-4/20"
      case "Closed":
        return "bg-muted text-muted-foreground border-border"
      default:
        return "bg-muted text-muted-foreground"
    }
  }

  const getTypeIcon = (type: string) => {
    switch (type) {
      case "Bug":
        return <Bug className="h-4 w-4 text-destructive" />
      case "Feature":
        return <AlertCircle className="h-4 w-4 text-chart-1" />
      case "Enhancement":
        return <AlertTriangle className="h-4 w-4 text-chart-5" />
      default:
        return <Info className="h-4 w-4 text-muted-foreground" />
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
                <h1 className="text-3xl font-bold tracking-tight text-balance">Issues</h1>
                <p className="text-muted-foreground mt-1">Track and manage project issues</p>
              </div>
              <Button className="gap-2">
                <Plus className="h-4 w-4" />
                New Issue
              </Button>
            </div>

            {/* Stats */}
            <div className="grid gap-4 md:grid-cols-4">
              <Card className="card-shadow">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium text-muted-foreground">Total Issues</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{stats.total}</div>
                </CardContent>
              </Card>
              <Card className="card-shadow">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium text-muted-foreground">Open</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-chart-1">{stats.open}</div>
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
                  <CardTitle className="text-sm font-medium text-muted-foreground">Resolved</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-chart-4">{stats.resolved}</div>
                </CardContent>
              </Card>
            </div>

            {/* Filters and Search */}
            <div className="flex items-center gap-4">
              <div className="relative flex-1 max-w-md">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input type="search" placeholder="Search issues..." className="pl-10 bg-secondary/50" />
              </div>
              <Button variant="outline" className="gap-2 bg-transparent">
                <Filter className="h-4 w-4" />
                Filter
              </Button>
            </div>

            {/* Tabs */}
            <Tabs defaultValue="all" className="space-y-4">
              <TabsList>
                <TabsTrigger value="all">All Issues</TabsTrigger>
                <TabsTrigger value="open">Open</TabsTrigger>
                <TabsTrigger value="in-progress">In Progress</TabsTrigger>
                <TabsTrigger value="resolved">Resolved</TabsTrigger>
              </TabsList>

              <TabsContent value="all" className="space-y-3">
                {issues.map((issue) => (
                  <Card key={issue.id} className="card-shadow hover:border-primary/30 transition-colors">
                    <CardContent className="p-4">
                      <div className="flex items-start gap-4">
                        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-secondary/50 border border-border/50 flex-shrink-0">
                          {getTypeIcon(issue.type)}
                        </div>
                        <div className="flex-1 space-y-2">
                          <div className="flex items-start justify-between gap-4">
                            <div className="space-y-1 flex-1">
                              <div className="flex items-center gap-2">
                                <span className="text-sm text-muted-foreground">#{issue.id.slice(-6)}</span>
                                <h3 className="font-medium leading-none">{issue.title}</h3>
                              </div>
                              <p className="text-sm text-muted-foreground">{issue.description}</p>
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
                                <DropdownMenuItem>Edit Issue</DropdownMenuItem>
                                <DropdownMenuItem>Change Status</DropdownMenuItem>
                                <DropdownMenuItem>Assign to</DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem className="text-destructive">Close Issue</DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>

                          <div className="flex items-center gap-4 flex-wrap">
                            <Badge variant="outline" className={getStatusColor(issue.status)}>
                              {issue.status}
                            </Badge>
                            <Badge variant="outline" className={getPriorityColor(issue.priority)}>
                              {issue.priority}
                            </Badge>
                            <Badge variant="outline">{issue.type}</Badge>
                            <div className="flex items-center gap-2">
                              <Avatar className="h-6 w-6 border border-primary/20">
                                <AvatarFallback className="bg-primary/10 text-primary text-xs">
                                  {issue.assignee.avatar}
                                </AvatarFallback>
                              </Avatar>
                              <span className="text-sm text-muted-foreground">{issue.assignee.name}</span>
                            </div>
                            <span className="text-sm text-muted-foreground">{issue.project}</span>
                            <div className="flex items-center gap-1 text-sm text-muted-foreground">
                              <MessageSquare className="h-3 w-3" />
                              <span>{issue.comments}</span>
                            </div>
                            <span className="text-sm text-muted-foreground">Created {issue.createdAt}</span>
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </TabsContent>

              <TabsContent value="open">
                <div className="space-y-3">
                  {issues
                    .filter((i) => i.status === "Open")
                    .map((issue) => (
                      <Card key={issue.id} className="card-shadow">
                        <CardContent className="p-4">
                          <h3 className="font-medium">{issue.title}</h3>
                          <p className="text-sm text-muted-foreground mt-1">{issue.description}</p>
                        </CardContent>
                      </Card>
                    ))}
                </div>
              </TabsContent>

              <TabsContent value="in-progress">
                <div className="space-y-3">
                  {issues
                    .filter((i) => i.status === "In Progress")
                    .map((issue) => (
                      <Card key={issue.id} className="card-shadow">
                        <CardContent className="p-4">
                          <h3 className="font-medium">{issue.title}</h3>
                          <p className="text-sm text-muted-foreground mt-1">{issue.description}</p>
                        </CardContent>
                      </Card>
                    ))}
                </div>
              </TabsContent>

              <TabsContent value="resolved">
                <div className="space-y-3">
                  {issues
                    .filter((i) => i.status === "Resolved")
                    .map((issue) => (
                      <Card key={issue.id} className="card-shadow">
                        <CardContent className="p-4">
                          <h3 className="font-medium">{issue.title}</h3>
                          <p className="text-sm text-muted-foreground mt-1">{issue.description}</p>
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
