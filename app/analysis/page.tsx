'use client'

import { AppSidebar } from "@/components/layout/app-sidebar"
import { AppHeader } from "@/components/layout/app-header"
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Download, TrendingUp, TrendingDown } from "lucide-react"
import {
  Bar,
  BarChart,
  Line,
  LineChart,
  Pie,
  PieChart,
  Cell,
  ResponsiveContainer,
  XAxis,
  YAxis,
  CartesianGrid,
  Legend,
} from "recharts"
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart"

export default function AnalysisPage() {
  const projectStatusData = [
    { name: "Completed", value: 42, color: "var(--chart-1)" },
    { name: "In Progress", value: 28, color: "var(--chart-2)" },
    { name: "Planning", value: 18, color: "var(--chart-3)" },
    { name: "On Hold", value: 12, color: "var(--chart-5)" },
  ]

  const teamPerformanceData = [
    { name: "Sarah Chen", completed: 45, inProgress: 8, efficiency: 92 },
    { name: "Mike Johnson", completed: 38, inProgress: 12, efficiency: 85 },
    { name: "Emily Davis", completed: 42, inProgress: 6, efficiency: 90 },
    { name: "Alex Turner", completed: 35, inProgress: 10, efficiency: 82 },
    { name: "Lisa Wang", completed: 40, inProgress: 7, efficiency: 88 },
  ]

  const monthlyTrendsData = [
    { month: "Jan", projects: 8, tasks: 145, issues: 23 },
    { month: "Feb", projects: 10, tasks: 168, issues: 19 },
    { month: "Mar", projects: 12, tasks: 192, issues: 25 },
    { month: "Apr", projects: 15, tasks: 215, issues: 18 },
    { month: "May", projects: 14, tasks: 203, issues: 21 },
    { month: "Jun", projects: 16, tasks: 248, issues: 16 },
  ]

  const budgetAnalysisData = [
    { project: "E-Commerce", budget: 125000, spent: 93750, remaining: 31250 },
    { project: "Mobile App", budget: 80000, spent: 36000, remaining: 44000 },
    { project: "API Integration", budget: 45000, spent: 40500, remaining: 4500 },
    { project: "Database Migration", budget: 60000, spent: 9000, remaining: 51000 },
  ]

  const taskCompletionData = [
    { week: "Week 1", completed: 32, target: 35 },
    { week: "Week 2", completed: 38, target: 35 },
    { week: "Week 3", completed: 35, target: 35 },
    { week: "Week 4", completed: 42, target: 35 },
    { week: "Week 5", completed: 40, target: 35 },
    { week: "Week 6", completed: 45, target: 35 },
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
                <h1 className="text-3xl font-bold tracking-tight text-balance">Data Analysis</h1>
                <p className="text-muted-foreground mt-1">Comprehensive insights and analytics</p>
              </div>
              <div className="flex gap-2">
                <Select defaultValue="last-30-days">
                  <SelectTrigger className="w-40 bg-transparent">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="last-7-days">Last 7 days</SelectItem>
                    <SelectItem value="last-30-days">Last 30 days</SelectItem>
                    <SelectItem value="last-90-days">Last 90 days</SelectItem>
                    <SelectItem value="last-year">Last year</SelectItem>
                  </SelectContent>
                </Select>
                <Button variant="outline" className="gap-2 bg-transparent">
                  <Download className="h-4 w-4" />
                  Export
                </Button>
              </div>
            </div>

            {/* Key Metrics */}
            <div className="grid gap-4 md:grid-cols-4">
              <Card className="card-shadow">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">Completion Rate</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-baseline gap-2">
                    <div className="text-3xl font-bold">87%</div>
                    <div className="flex items-center text-sm font-medium text-chart-4">
                      <TrendingUp className="h-4 w-4" />
                      +5%
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="card-shadow">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">Avg. Project Duration</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-baseline gap-2">
                    <div className="text-3xl font-bold">3.2</div>
                    <span className="text-sm text-muted-foreground">months</span>
                  </div>
                </CardContent>
              </Card>

              <Card className="card-shadow">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">Team Efficiency</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-baseline gap-2">
                    <div className="text-3xl font-bold">92%</div>
                    <div className="flex items-center text-sm font-medium text-chart-4">
                      <TrendingUp className="h-4 w-4" />
                      +3%
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="card-shadow">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">Budget Utilization</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-baseline gap-2">
                    <div className="text-3xl font-bold">68%</div>
                    <div className="flex items-center text-sm font-medium text-destructive">
                      <TrendingDown className="h-4 w-4" />
                      -2%
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Tabs */}
            <Tabs defaultValue="overview" className="space-y-4">
              <TabsList>
                <TabsTrigger value="overview">Overview</TabsTrigger>
                <TabsTrigger value="projects">Projects</TabsTrigger>
                <TabsTrigger value="team">Team Performance</TabsTrigger>
                <TabsTrigger value="budget">Budget</TabsTrigger>
              </TabsList>

              <TabsContent value="overview" className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <Card className="card-shadow">
                    <CardHeader>
                      <CardTitle>Monthly Trends</CardTitle>
                      <CardDescription>Projects, tasks, and issues over time</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <ChartContainer
                        config={{
                          projects: {
                            label: "Projects",
                            color: "var(--chart-1)",
                          },
                          tasks: {
                            label: "Tasks",
                            color: "var(--chart-2)",
                          },
                          issues: {
                            label: "Issues",
                            color: "var(--chart-3)",
                          },
                        }}
                        className="h-[300px]"
                      >
                        <ResponsiveContainer width="100%" height="100%">
                          <LineChart data={monthlyTrendsData}>
                            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" opacity={0.3} />
                            <XAxis dataKey="month" stroke="var(--muted-foreground)" fontSize={12} />
                            <YAxis stroke="var(--muted-foreground)" fontSize={12} />
                            <ChartTooltip content={<ChartTooltipContent />} />
                            <Legend />
                            <Line
                              type="monotone"
                              dataKey="projects"
                              stroke="var(--chart-1)"
                              strokeWidth={2}
                              dot={{ fill: "var(--chart-1)", r: 4 }}
                            />
                            <Line
                              type="monotone"
                              dataKey="tasks"
                              stroke="var(--chart-2)"
                              strokeWidth={2}
                              dot={{ fill: "var(--chart-2)", r: 4 }}
                            />
                            <Line
                              type="monotone"
                              dataKey="issues"
                              stroke="var(--chart-3)"
                              strokeWidth={2}
                              dot={{ fill: "var(--chart-3)", r: 4 }}
                            />
                          </LineChart>
                        </ResponsiveContainer>
                      </ChartContainer>
                    </CardContent>
                  </Card>

                  <Card className="card-shadow">
                    <CardHeader>
                      <CardTitle>Project Status Distribution</CardTitle>
                      <CardDescription>Current status of all projects</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <ChartContainer
                        config={{
                          value: {
                            label: "Projects",
                          },
                        }}
                        className="h-[300px]"
                      >
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie
                              data={projectStatusData}
                              cx="50%"
                              cy="50%"
                              labelLine={false}
                              label={({ name, percent }) =>
                                `${name} ${(Number(percent ?? 0) * 100).toFixed(0)}%`
                              }
                              outerRadius={100}
                              fill="#8884d8"
                              dataKey="value"
                            >
                              {projectStatusData.map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={entry.color} />
                              ))}
                            </Pie>
                            <ChartTooltip content={<ChartTooltipContent />} />
                          </PieChart>
                        </ResponsiveContainer>
                      </ChartContainer>
                    </CardContent>
                  </Card>
                </div>

                <Card className="card-shadow">
                  <CardHeader>
                    <CardTitle>Task Completion vs Target</CardTitle>
                    <CardDescription>Weekly task completion compared to target</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ChartContainer
                      config={{
                        completed: {
                          label: "Completed",
                          color: "var(--chart-1)",
                        },
                        target: {
                          label: "Target",
                          color: "var(--chart-3)",
                        },
                      }}
                      className="h-[300px]"
                    >
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={taskCompletionData}>
                          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" opacity={0.3} />
                          <XAxis dataKey="week" stroke="var(--muted-foreground)" fontSize={12} />
                          <YAxis stroke="var(--muted-foreground)" fontSize={12} />
                          <ChartTooltip content={<ChartTooltipContent />} />
                          <Legend />
                          <Bar dataKey="completed" fill="var(--chart-1)" radius={[4, 4, 0, 0]} />
                          <Bar dataKey="target" fill="var(--chart-3)" radius={[4, 4, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </ChartContainer>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="team" className="space-y-4">
                <Card className="card-shadow">
                  <CardHeader>
                    <CardTitle>Team Performance Metrics</CardTitle>
                    <CardDescription>Individual team member productivity and efficiency</CardDescription>
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
                      className="h-[400px]"
                    >
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={teamPerformanceData} layout="vertical">
                          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" opacity={0.3} />
                          <XAxis type="number" stroke="var(--muted-foreground)" fontSize={12} />
                          <YAxis
                            dataKey="name"
                            type="category"
                            stroke="var(--muted-foreground)"
                            fontSize={12}
                            width={100}
                          />
                          <ChartTooltip content={<ChartTooltipContent />} />
                          <Legend />
                          <Bar dataKey="completed" fill="var(--chart-1)" radius={[0, 4, 4, 0]} />
                          <Bar dataKey="inProgress" fill="var(--chart-2)" radius={[0, 4, 4, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </ChartContainer>
                  </CardContent>
                </Card>

                <div className="grid gap-4 md:grid-cols-3">
                  {teamPerformanceData.map((member) => (
                    <Card key={member.name} className="card-shadow">
                      <CardHeader>
                        <CardTitle className="text-base">{member.name}</CardTitle>
                        <CardDescription>Performance Overview</CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-muted-foreground">Completed Tasks</span>
                          <span className="text-lg font-bold">{member.completed}</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-muted-foreground">In Progress</span>
                          <span className="text-lg font-bold">{member.inProgress}</span>
                        </div>
                        <div className="flex items-center justify-between pt-2 border-t border-border/50">
                          <span className="text-sm text-muted-foreground">Efficiency</span>
                          <span className="text-lg font-bold text-chart-4">{member.efficiency}%</span>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </TabsContent>

              <TabsContent value="budget" className="space-y-4">
                <Card className="card-shadow">
                  <CardHeader>
                    <CardTitle>Budget Analysis by Project</CardTitle>
                    <CardDescription>Budget allocation and spending across projects</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ChartContainer
                      config={{
                        spent: {
                          label: "Spent",
                          color: "var(--chart-3)",
                        },
                        remaining: {
                          label: "Remaining",
                          color: "var(--chart-4)",
                        },
                      }}
                      className="h-[300px]"
                    >
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={budgetAnalysisData}>
                          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" opacity={0.3} />
                          <XAxis dataKey="project" stroke="var(--muted-foreground)" fontSize={12} />
                          <YAxis stroke="var(--muted-foreground)" fontSize={12} />
                          <ChartTooltip content={<ChartTooltipContent />} />
                          <Legend />
                          <Bar dataKey="spent" stackId="a" fill="var(--chart-3)" radius={[0, 0, 0, 0]} />
                          <Bar dataKey="remaining" stackId="a" fill="var(--chart-4)" radius={[4, 4, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </ChartContainer>
                  </CardContent>
                </Card>

                <div className="grid gap-4 md:grid-cols-2">
                  {budgetAnalysisData.map((project) => (
                    <Card key={project.project} className="card-shadow">
                      <CardHeader>
                        <CardTitle className="text-base">{project.project}</CardTitle>
                        <CardDescription>Budget Breakdown</CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-muted-foreground">Total Budget</span>
                          <span className="text-lg font-bold">${project.budget.toLocaleString()}</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-muted-foreground">Spent</span>
                          <span className="text-lg font-bold text-chart-3">${project.spent.toLocaleString()}</span>
                        </div>
                        <div className="flex items-center justify-between pt-2 border-t border-border/50">
                          <span className="text-sm text-muted-foreground">Remaining</span>
                          <span className="text-lg font-bold text-chart-4">${project.remaining.toLocaleString()}</span>
                        </div>
                        <div className="pt-2">
                          <div className="flex items-center justify-between text-sm mb-1">
                            <span className="text-muted-foreground">Utilization</span>
                            <span className="font-medium">{((project.spent / project.budget) * 100).toFixed(1)}%</span>
                          </div>
                        </div>
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
