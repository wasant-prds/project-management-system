import { AppSidebar } from "@/components/layout/app-sidebar"
import { AppHeader } from "@/components/layout/app-header"
import { DashboardCharts } from "@/components/layout/dashboard-charts"
import { LoggedHoursStat } from "@/components/layout/logged-hours-stat"
import {
  ACTION_LABEL_CLASS,
  PAGE_HEADING,
  PAGE_INNER,
  PAGE_LEAD,
  PAGE_MAIN,
  PAGE_TOOLBAR,
  STAT_GRID,
} from "@/components/layout/page-layout"
import { SummaryStatCard } from "@/components/layout/summary-stat-card"
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
        <main className={PAGE_MAIN}>
          <div className={PAGE_INNER}>
            <div className={PAGE_TOOLBAR}>
              <div className="min-w-0">
                <h1 className={PAGE_HEADING}>Dashboard</h1>
                <p className={PAGE_LEAD}>Welcome back! Here&apos;s what&apos;s happening with your projects.</p>
              </div>
              <div className="flex flex-wrap justify-end gap-2">
                <Button variant="outline">
                  <Activity className="h-4 w-4" />
                  <span className={ACTION_LABEL_CLASS}>Activity</span>
                </Button>
                <Button>
                  <Plus className="h-4 w-4" />
                  <span className="sm:hidden">New</span>
                  <span className="hidden sm:inline">New Project</span>
                </Button>
              </div>
            </div>

            <div className={STAT_GRID}>
              {stats.map((stat) => (
                <SummaryStatCard
                  key={stat.title}
                  label={stat.title}
                  value={stat.value}
                  icon={<stat.icon className={`h-4 w-4 ${stat.color}`} />}
                  hint={
                    <div
                      className={`mt-1 flex items-center text-sm font-medium ${
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
                  }
                />
              ))}
              <LoggedHoursStat label="ชั่วโมงสะสม" />
            </div>

            <DashboardCharts />

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
