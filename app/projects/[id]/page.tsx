'use client'

import { use, useEffect, useState } from "react"
import { AppSidebar } from "@/components/layout/app-sidebar"
import { AppHeader } from "@/components/layout/app-header"
import {
  PAGE_HEADING,
  PAGE_INNER,
  PAGE_LEAD,
  PAGE_MAIN,
  PAGE_TOOLBAR,
  STAT_GRID,
  TAB_SCROLL_CLASS,
  TAB_TRIGGER_CLASS,
} from "@/components/layout/page-layout"
import { SummaryStatCard } from "@/components/layout/summary-stat-card"
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Skeleton } from "@/components/ui/skeleton"
import {
  ArrowLeft,
  Calendar,
  Users,
  Target,
  DollarSign,
  Clock,
  Edit,
  Share2,
  MoreVertical,
  CheckCircle2,
  Circle,
  AlertCircle,
} from "lucide-react"
import Link from "next/link"
import { Bar, BarChart, ResponsiveContainer, XAxis, YAxis, CartesianGrid } from "recharts"
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart"
import { formatDate } from "@/lib/utils"

interface ProjectData {
  id: string
  name: string
  description: string | null
  status: string
  priority: string
  progress: number
  startDate: string
  dueDate: string
  budget: number | null
  spent: number | null
  creator: {
    name: string
    email: string
    avatar: string | null
  } | null
  members: Array<{
    role: string
    user: {
      id: string
      name: string
      email: string
      avatar: string | null
    }
  }>
  workItems: Array<{
    id: string
    title: string
    kind: string
    status: string
    priority: string
    dueDate: string | null
    assignee: {
      name: string
      avatar: string | null
    } | null
  }>
  milestones: Array<{
    id: string
    name: string
    description: string | null
    dueDate: string
    status: string
  }>
}

export default function ProjectDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const [project, setProject] = useState<ProjectData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function fetchProject() {
      try {
        setLoading(true)
        const response = await fetch(`/api/projects/${id}`)

        if (!response.ok) {
          throw new Error('Failed to fetch project')
        }

        const data = await response.json()
        setProject(data.project)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'An error occurred')
      } finally {
        setLoading(false)
      }
    }

    fetchProject()
  }, [id])

  // Calculate weekly progress from work items
  const getWeeklyProgress = () => {
    if (!project?.workItems.length) return []

    const completedItems = project.workItems.filter(item => item.status === 'completed')
    const weeks = 6
    const itemsPerWeek = Math.ceil(completedItems.length / weeks)

    return Array.from({ length: weeks }, (_, i) => ({
      week: `Week ${i + 1}`,
      completed: Math.min((i + 1) * itemsPerWeek, completedItems.length)
    }))
  }

  // Format currency
  const formatCurrency = (amount: number | null) => {
    if (amount === null) return 'N/A'
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(Number(amount))
  }

  // Get initials from name
  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map(n => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2)
  }

  // Map milestone status to match display format
  const getMilestoneDisplayStatus = (status: string) => {
    const statusMap: Record<string, string> = {
      'Not Started': 'pending',
      'In Progress': 'in-progress',
      'Completed': 'completed'
    }
    return statusMap[status] || status.toLowerCase()
  }

  // Map work item status to display format
  const getWorkItemDisplayStatus = (status: string) => {
    if (status === 'completed') return 'completed'
    if (status === 'in-progress' || status === 'sa-testing' || status === 'pm-testing') return 'in-progress'
    return 'pending'
  }

  if (loading) {
    return (
      <SidebarProvider>
        <AppSidebar />
        <SidebarInset>
          <AppHeader />
          <main className={PAGE_MAIN}>
            <div className={PAGE_INNER}>
              <Skeleton className="h-20 w-full" />
              <div className={STAT_GRID}>
                <Skeleton className="h-20 w-full" />
                <Skeleton className="h-20 w-full" />
                <Skeleton className="h-20 w-full" />
                <Skeleton className="h-20 w-full" />
              </div>
              <Skeleton className="h-96 w-full" />
            </div>
          </main>
        </SidebarInset>
      </SidebarProvider>
    )
  }

  if (error || !project) {
    return (
      <SidebarProvider>
        <AppSidebar />
        <SidebarInset>
          <AppHeader />
          <main className={PAGE_MAIN}>
            <div className={PAGE_INNER}>
            <Card className="card-shadow">
              <CardContent className="flex flex-col items-center justify-center py-12">
                <AlertCircle className="h-12 w-12 text-destructive mb-4" />
                <h2 className="text-2xl font-bold mb-2">Project Not Found</h2>
                <p className="text-muted-foreground mb-6">
                  {error || 'The project you are looking for does not exist.'}
                </p>
                <Link href="/projects">
                  <Button>
                    <ArrowLeft className="h-4 w-4 mr-2" />
                    Back to Projects
                  </Button>
                </Link>
              </CardContent>
            </Card>
            </div>
          </main>
        </SidebarInset>
      </SidebarProvider>
    )
  }

  const weeklyProgress = getWeeklyProgress()

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <AppHeader />
        <main className={PAGE_MAIN}>
          <div className={PAGE_INNER}>
            <div className={PAGE_TOOLBAR}>
              <div className="flex min-w-0 items-start gap-3">
                <Link href="/projects">
                  <Button variant="ghost" size="icon" aria-label="Back to projects">
                    <ArrowLeft className="h-4 w-4" />
                  </Button>
                </Link>
                <div className="min-w-0 flex-1">
                  <h1 className={PAGE_HEADING}>{project.name}</h1>
                  <p className={PAGE_LEAD}>{project.description || 'No description available'}</p>
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" size="icon" aria-label="Share project">
                  <Share2 className="h-4 w-4" />
                </Button>
                <Button variant="outline" size="icon" aria-label="Edit project">
                  <Edit className="h-4 w-4" />
                </Button>
                <Button variant="outline" size="icon" aria-label="More project actions">
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </div>
            </div>

            <div className={STAT_GRID}>
              <SummaryStatCard
                label="Progress"
                value={`${project.progress}%`}
                icon={<Target className="h-4 w-4 text-chart-1" />}
                hint={<Progress value={project.progress} className="mt-2 h-2" />}
              />

              <SummaryStatCard
                label="Budget"
                value={formatCurrency(project.spent)}
                icon={<DollarSign className="h-4 w-4 text-chart-2" />}
                hint={<p className="mt-1 text-xs text-muted-foreground">of {formatCurrency(project.budget)}</p>}
              />
              <SummaryStatCard
                label="Team Size"
                value={project.members.length}
                icon={<Users className="h-4 w-4 text-chart-3" />}
                hint={<p className="mt-1 text-xs text-muted-foreground">members</p>}
              />
              <SummaryStatCard
                label="Due Date"
                value={formatDate(project.dueDate)}
                icon={<Calendar className="h-4 w-4 text-chart-4" />}
              />
            </div>

            <Tabs defaultValue="overview" className="space-y-4">
              <div className={TAB_SCROLL_CLASS}>
                <TabsList>
                  <TabsTrigger className={TAB_TRIGGER_CLASS} value="overview">Overview</TabsTrigger>
                  <TabsTrigger className={TAB_TRIGGER_CLASS} value="work-items">Work Items</TabsTrigger>
                  <TabsTrigger className={TAB_TRIGGER_CLASS} value="team">Team</TabsTrigger>
                  <TabsTrigger className={TAB_TRIGGER_CLASS} value="milestones">Milestones</TabsTrigger>
                </TabsList>
              </div>

              <TabsContent value="overview" className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <Card className="card-shadow">
                    <CardHeader>
                      <CardTitle>Weekly Progress</CardTitle>
                      <CardDescription>Work items completed per week</CardDescription>
                    </CardHeader>
                    <CardContent>
                      {weeklyProgress.length > 0 ? (
                        <ChartContainer
                          config={{
                            completed: {
                              label: "Completed",
                              color: "var(--chart-1)",
                            },
                          }}
                          className="h-[250px]"
                        >
                          <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={weeklyProgress}>
                              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" opacity={0.3} />
                              <XAxis dataKey="week" stroke="var(--muted-foreground)" fontSize={12} />
                              <YAxis stroke="var(--muted-foreground)" fontSize={12} />
                              <ChartTooltip content={<ChartTooltipContent />} />
                              <Bar dataKey="completed" fill="var(--chart-1)" radius={[4, 4, 0, 0]} />
                            </BarChart>
                          </ResponsiveContainer>
                        </ChartContainer>
                      ) : (
                        <div className="flex items-center justify-center h-[250px] text-muted-foreground">
                          No completed work items yet
                        </div>
                      )}
                    </CardContent>
                  </Card>

                  <Card className="card-shadow">
                    <CardHeader>
                      <CardTitle>Team Members</CardTitle>
                      <CardDescription>Project team and their roles</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-4">
                        {project.members.length > 0 ? (
                          project.members.map((member) => (
                            <div key={member.user.id} className="flex items-center gap-3">
                              <Avatar className="h-10 w-10 border-2 border-primary/20">
                                <AvatarFallback className="bg-primary/10 text-primary text-xs font-semibold">
                                  {getInitials(member.user.name)}
                                </AvatarFallback>
                              </Avatar>
                              <div className="flex-1">
                                <p className="text-sm font-medium">{member.user.name}</p>
                                <p className="text-xs text-muted-foreground">{member.role}</p>
                              </div>
                            </div>
                          ))
                        ) : (
                          <p className="text-sm text-muted-foreground text-center py-4">
                            No team members assigned yet
                          </p>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </TabsContent>

              <TabsContent value="work-items" className="space-y-4">
                <Card className="card-shadow">
                  <CardHeader>
                    <CardTitle>Project Work Items</CardTitle>
                    <CardDescription>Incidents, issues, and tasks in this project</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {project.workItems.length > 0 ? (
                        project.workItems.map((item) => {
                          const displayStatus = getWorkItemDisplayStatus(item.status)
                          const isCompleted = item.status === 'completed'
                          return (
                            <div
                              key={item.id}
                              className="flex items-center gap-3 p-3 rounded-lg border border-border/50 hover:border-primary/30 transition-colors"
                            >
                              {isCompleted ? (
                                <CheckCircle2 className="h-5 w-5 text-chart-1 flex-shrink-0" />
                              ) : displayStatus === "in-progress" ? (
                                <Clock className="h-5 w-5 text-chart-2 flex-shrink-0" />
                              ) : (
                                <Circle className="h-5 w-5 text-muted-foreground flex-shrink-0" />
                              )}
                              <div className="flex-1">
                                <p className="text-sm font-medium">{item.title}</p>
                                <div className="flex items-center gap-3 mt-1">
                                  <span className="text-xs text-muted-foreground">
                                    {item.kind} · Assigned to {item.assignee?.name || 'Unassigned'}
                                  </span>
                                  {item.dueDate && (
                                    <span className="text-xs text-muted-foreground">
                                      Due {formatDate(item.dueDate)}
                                    </span>
                                  )}
                                </div>
                              </div>
                              <Badge
                                variant="outline"
                                className={
                                  isCompleted
                                    ? "bg-chart-1/10 text-chart-1 border-chart-1/20"
                                    : displayStatus === "in-progress"
                                      ? "bg-chart-2/10 text-chart-2 border-chart-2/20"
                                      : "bg-muted text-muted-foreground"
                                }
                              >
                                {item.status}
                              </Badge>
                            </div>
                          )
                        })
                      ) : (
                        <p className="text-sm text-muted-foreground text-center py-8">
                          No work items available for this project
                        </p>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="team" className="space-y-4">
                {project.members.length > 0 ? (
                  <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                    {project.members.map((member) => (
                      <Card key={member.user.id} className="card-shadow">
                        <CardHeader>
                          <div className="flex items-center gap-3">
                            <Avatar className="h-12 w-12 border-2 border-primary/20">
                              <AvatarFallback className="bg-primary/10 text-primary font-semibold">
                                {getInitials(member.user.name)}
                              </AvatarFallback>
                            </Avatar>
                            <div>
                              <CardTitle className="text-base">{member.user.name}</CardTitle>
                              <CardDescription>{member.role}</CardDescription>
                            </div>
                          </div>
                        </CardHeader>
                      </Card>
                    ))}
                  </div>
                ) : (
                  <Card className="card-shadow">
                    <CardContent className="flex items-center justify-center py-12">
                      <p className="text-muted-foreground">No team members assigned to this project</p>
                    </CardContent>
                  </Card>
                )}
              </TabsContent>

              <TabsContent value="milestones" className="space-y-4">
                <Card className="card-shadow">
                  <CardHeader>
                    <CardTitle>Project Milestones</CardTitle>
                    <CardDescription>Key milestones and their status</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      {project.milestones.length > 0 ? (
                        project.milestones.map((milestone, index) => {
                          const displayStatus = getMilestoneDisplayStatus(milestone.status)
                          return (
                            <div key={milestone.id} className="flex items-start gap-4">
                              <div className="flex flex-col items-center">
                                <div
                                  className={`flex h-8 w-8 items-center justify-center rounded-full border-2 ${displayStatus === "completed"
                                      ? "bg-chart-1/20 border-chart-1"
                                      : displayStatus === "in-progress"
                                        ? "bg-chart-2/20 border-chart-2"
                                        : "bg-muted border-border"
                                    }`}
                                >
                                  {displayStatus === "completed" && <CheckCircle2 className="h-4 w-4 text-chart-1" />}
                                  {displayStatus === "in-progress" && <Clock className="h-4 w-4 text-chart-2" />}
                                  {displayStatus === "pending" && <Circle className="h-4 w-4 text-muted-foreground" />}
                                </div>
                                {index < project.milestones.length - 1 && <div className="w-0.5 h-12 bg-border/50 mt-2" />}
                              </div>
                              <div className="flex-1 pb-8">
                                <p className="font-medium">{milestone.name}</p>
                                <p className="text-sm text-muted-foreground mt-1">{formatDate(milestone.dueDate)}</p>
                                {milestone.description && (
                                  <p className="text-xs text-muted-foreground mt-1">{milestone.description}</p>
                                )}
                              </div>
                            </div>
                          )
                        })
                      ) : (
                        <p className="text-sm text-muted-foreground text-center py-8">
                          No milestones defined for this project
                        </p>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </div>
        </main>
      </SidebarInset>
    </SidebarProvider>
  )
}
