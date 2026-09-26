'use client'

import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, XAxis, YAxis } from 'recharts'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart'

const projectCompletionData = [
  { month: 'Jan', completed: 12, inProgress: 8 },
  { month: 'Feb', completed: 15, inProgress: 10 },
  { month: 'Mar', completed: 18, inProgress: 12 },
  { month: 'Apr', completed: 22, inProgress: 15 },
  { month: 'May', completed: 25, inProgress: 14 },
  { month: 'Jun', completed: 28, inProgress: 12 },
]

const taskActivityData = [
  { day: 'Mon', tasks: 45 },
  { day: 'Tue', tasks: 52 },
  { day: 'Wed', tasks: 48 },
  { day: 'Thu', tasks: 61 },
  { day: 'Fri', tasks: 55 },
  { day: 'Sat', tasks: 32 },
  { day: 'Sun', tasks: 28 },
]

export function DashboardCharts() {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card className="card-shadow">
        <CardHeader>
          <CardTitle>Project Completion Trends</CardTitle>
          <CardDescription>Monthly project completion vs in-progress</CardDescription>
        </CardHeader>
        <CardContent>
          <ChartContainer
            config={{
              completed: { label: 'Completed', color: 'var(--chart-1)' },
              inProgress: { label: 'In Progress', color: 'var(--chart-2)' },
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

      <Card className="card-shadow">
        <CardHeader>
          <CardTitle>Weekly Task Activity</CardTitle>
          <CardDescription>Tasks completed this week</CardDescription>
        </CardHeader>
        <CardContent>
          <ChartContainer
            config={{ tasks: { label: 'Tasks', color: 'var(--chart-2)' } }}
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
                  dot={{ fill: 'var(--chart-2)', r: 4 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </ChartContainer>
        </CardContent>
      </Card>
    </div>
  )
}
