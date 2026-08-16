'use client'

import { AppSidebar } from "@/components/layout/app-sidebar"
import { AppHeader } from "@/components/layout/app-header"
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { Badge } from "@/components/ui/badge"
import {
  ArrowUpRight,
  ArrowDownRight,
  FolderKanban,
  CheckSquare,
  AlertCircle,
  Users,
  Clock,
  MoreVertical,
  Plus,
  Activity,
} from "lucide-react"
import { Bar, BarChart, Line, LineChart, ResponsiveContainer, XAxis, YAxis, CartesianGrid } from "recharts"
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart"

export default function DashboardPage() {
  const stats = [
    {
      title: "Active Projects",
      value: "12",
      change: "+2",
      trend: "up",
      icon: FolderKanban,
      color: "text-chart-1",
    },
    {
      title: "Work Items",
      value: "248",
      change: "+18",
      trend: "up",
      icon: CheckSquare,
      color: "text-chart-2",
    },
    {
      title: "Open Work Items",
      value: "23",
      change: "-5",
      trend: "down",
      icon: AlertCircle,
      color: "text-chart-3",
    },
    {
      title: "Team Members",
      value: "45",
      change: "+3",
      trend: "up",
      icon: Users,
      color: "text-chart-4",
    },
  ]

  const recentProjects = [
    {
      name: "E-Commerce Platform",
      progress: 75,
      status: "In Progress",
      dueDate: "2025-11-15",
      team: 8,
    },
    {
      name: "Mobile App Redesign",
      progress: 45,
      status: "In Progress",
      dueDate: "2025-12-01",
      team: 5,
    },
    {
      name: "API Integration",
      progress: 90,
      status: "Review",
      dueDate: "2025-10-20",
      team: 3,
    },
  ]

  const projectCompletionData = [
    { month: "Jan", completed: 12, inProgress: 8 },
    { month: "Feb", completed: 15, inProgress: 10 },
    { month: "Mar", completed: 18, inProgress: 12 },
    { month: "Apr", completed: 22, inProgress: 15 },
    { month: "May", completed: 25, inProgress: 14 },
    { month: "Jun", completed: 28, inProgress: 12 },
  ]

  const taskActivityData = [
    { day: "Mon", tasks: 45 },
    { day: "Tue", tasks: 52 },
    { day: "Wed", tasks: 48 },
    { day: "Thu", tasks: 61 },
    { day: "Fri", tasks: 55 },
    { day: "Sat", tasks: 32 },
    { day: "Sun", tasks: 28 },
  ]

  const recentActivity = [
    {
      user: "Sarah Chen",
      action: "completed task",
      target: "Update API Documentation",
      time: "5 minutes ago",
      type: "task",
    },
    {
      user: "Mike Johnson",
      action: "created issue",
      target: "Login page not responsive",
      time: "12 minutes ago",
      type: "issue",
    },
    {
      user: "Emily Davis",
      action: "commented on",
      target: "E-Commerce Platform",
      time: "1 hour ago",
      type: "comment",
    },
    {
      user: "Alex Turner",
      action: "updated project",
      target: "Mobile App Redesign",
      time: "2 hours ago",
      type: "project",
    },
  ]

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
                <h1 className="text-3xl font-bold tracking-tight text-balance">Dashboard</h1>
                <p className="text-muted-foreground mt-1">Welcome back! Here's what's happening with your projects.</p>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" className="gap-2 bg-transparent">
                  <Activity className="h-4 w-4" />
                  Activity
                </Button>
                <Button className="gap-2">
                  <Plus className="h-4 w-4" />
                  New Project
                </Button>
              </div>
            </div>

            {/* Stats Grid */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              {stats.map((stat) => (
                <Card key={stat.title} className="card-shadow">
                  <CardHeader className="flex flex-row items-center justify-between pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">{stat.title}</CardTitle>
                    <stat.icon className={`h-4 w-4 ${stat.color}`} />
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-baseline gap-2">
                      <div className="text-3xl font-bold">{stat.value}</div>
                      <div
                        className={`flex items-center text-sm font-medium ${
                          stat.trend === "up" ? "text-chart-4" : "text-chart-3"
                        }`}
                      >
                        {stat.trend === "up" ? (
                          <ArrowUpRight className="h-4 w-4" />
                        ) : (
                          <ArrowDownRight className="h-4 w-4" />
                        )}
                        {stat.change}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              {/* Project Completion Chart */}
              <Card className="card-shadow">
                <CardHeader>
                  <CardTitle>Project Completion Trends</CardTitle>
                  <CardDescription>Monthly project completion vs in-progress</CardDescription>
                </CardHeader>
                <CardContent>
                  <ChartContainer
                    config={{
                      completed: {
                        label: "Completed",
                        color: "var(--chart-1)",
                      },
                      inProgress: {
                        label: "In Progress",
                        color: "var(--chart-2)",
                      },
                    }}
                    className="h-[250px]"
                  >
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={projectCompletionData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" opacity={0.3} />
                        <XAxis dataKey="month" stroke="var(--muted-foreground)" fontSize={12} />
                        <YAxis stroke="var(--muted-foreground)" fontSize={12} />
                        <ChartTooltip content={<ChartTooltipContent />} />
                        <Bar dataKey="completed" fill="var(--chart-1)" radius={[4, 4, 0, 0]} />
                        <Bar dataKey="inProgress" fill="var(--chart-2)" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </ChartContainer>
                </CardContent>
              </Card>

              {/* Task Activity Chart */}
              <Card className="card-shadow">
                <CardHeader>
                  <CardTitle>Weekly Task Activity</CardTitle>
                  <CardDescription>Tasks completed this week</CardDescription>
                </CardHeader>
                <CardContent>
                  <ChartContainer
                    config={{
                      tasks: {
                        label: "Tasks",
                        color: "var(--chart-2)",
                      },
                    }}
                    className="h-[250px]"
                  >
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={taskActivityData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" opacity={0.3} />
                        <XAxis dataKey="day" stroke="var(--muted-foreground)" fontSize={12} />
                        <YAxis stroke="var(--muted-foreground)" fontSize={12} />
                        <ChartTooltip content={<ChartTooltipContent />} />
                        <Line
                          type="monotone"
                          dataKey="tasks"
                          stroke="var(--chart-2)"
                          strokeWidth={2}
                          dot={{ fill: "var(--chart-2)", r: 4 }}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </ChartContainer>
                </CardContent>
              </Card>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              {/* Recent Projects */}
              <Card className="card-shadow">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle>Recent Projects</CardTitle>
                      <CardDescription>Track progress and manage your active projects</CardDescription>
                    </div>
                    <Button variant="ghost" size="icon">
                      <MoreVertical className="h-4 w-4" />
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-6">
                    {recentProjects.map((project) => (
                      <div key={project.name} className="space-y-2">
                        <div className="flex items-center justify-between">
                          <div className="space-y-1">
                            <p className="font-medium leading-none">{project.name}</p>
                            <div className="flex items-center gap-4 text-sm text-muted-foreground">
                              <span className="flex items-center gap-1">
                                <Clock className="h-3 w-3" />
                                Due {project.dueDate}
                              </span>
                              <span className="flex items-center gap-1">
                                <Users className="h-3 w-3" />
                                {project.team} members
                              </span>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge variant="secondary" className="text-xs">
                              {project.status}
                            </Badge>
                            <span className="text-sm font-medium">{project.progress}%</span>
                          </div>
                        </div>
                        <Progress value={project.progress} className="h-2" />
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              <Card className="card-shadow">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle>Recent Activity</CardTitle>
                      <CardDescription>Latest updates from your team</CardDescription>
                    </div>
                    <Button variant="ghost" size="icon">
                      <MoreVertical className="h-4 w-4" />
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {recentActivity.map((activity) => (
                      <div key={`${activity.user}-${activity.target}-${activity.time}`} className="flex gap-3">
                        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 border border-primary/20 flex-shrink-0">
                          <span className="text-xs font-semibold text-primary">
                            {activity.user
                              .split(" ")
                              .map((n) => n[0])
                              .join("")}
                          </span>
                        </div>
                        <div className="flex-1 space-y-1">
                          <p className="text-sm leading-none">
                            <span className="font-medium">{activity.user}</span>{" "}
                            <span className="text-muted-foreground">{activity.action}</span>{" "}
                            <span className="font-medium">{activity.target}</span>
                          </p>
                          <p className="text-xs text-muted-foreground">{activity.time}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </main>
      </SidebarInset>
    </SidebarProvider>
  )
}
