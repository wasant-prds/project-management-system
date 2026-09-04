"use client"

import { AppSidebar } from "@/components/layout/app-sidebar"
import { AppHeader } from "@/components/layout/app-header"
import {
  PAGE_HEADING,
  PAGE_INNER,
  PAGE_LEAD,
  PAGE_MAIN,
  PAGE_TOOLBAR,
} from "@/components/layout/page-layout"
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import { Plus } from "lucide-react"
import { useState, useEffect, useMemo, useCallback } from "react"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { toast } from "@/hooks/use-toast"
import { formatDate } from "@/lib/utils"
import { WorkLog, Project, User, WorkLogFormData, emptyWorkLogForm } from "@/components/page/daily-work/types"
import { WorkLogList } from "@/components/page/daily-work/work-log-list"
import { WorkLogDialog } from "@/components/page/daily-work/work-log-dialog"
import { StatsCard } from "@/components/page/daily-work/stats-card"

export default function DailyWorkPage() {
  const [date, setDate] = useState<Date | undefined>(new Date())
  const [workLogs, setWorkLogs] = useState<WorkLog[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [users, setUsers] = useState<User[]>([])
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [isDetailsDialogOpen, setIsDetailsDialogOpen] = useState(false)
  const [selectedWorkLog, setSelectedWorkLog] = useState<WorkLog | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [searchQuery, setSearchQuery] = useState("")
  const [viewPeriod, setViewPeriod] = useState<"day" | "week" | "month" | "year">("day")

  // Form state
  const [formData, setFormData] = useState<WorkLogFormData>(emptyWorkLogForm(formatDate(new Date())))

  // Fetch work logs based on selected date and view period
  useEffect(() => {
    fetchWorkLogs()
  }, [date, viewPeriod])

  // Fetch projects and users on mount
  useEffect(() => {
    fetchProjects()
    fetchUsers()
  }, [])

  const fetchWorkLogs = async () => {
    try {
      let queryParam = ""

      if (date) {
        if (viewPeriod === "day") {
          const dateStr = formatDate(date)
          queryParam = `?date=${dateStr}`
        } else {
          // Calculate date range based on view period
          const startDate = new Date(date)
          const endDate = new Date(date)

          if (viewPeriod === "week") {
            // Get start of week (Sunday)
            const day = startDate.getDay()
            startDate.setDate(startDate.getDate() - day)
            endDate.setDate(startDate.getDate() + 6)
          } else if (viewPeriod === "month") {
            startDate.setDate(1)
            endDate.setMonth(endDate.getMonth() + 1)
            endDate.setDate(0) // Last day of month
          } else if (viewPeriod === "year") {
            startDate.setMonth(0, 1)
            endDate.setMonth(11, 31)
          }

          queryParam = `?startDate=${formatDate(startDate)}&endDate=${formatDate(endDate)}`
        }
      }

      const response = await fetch(`/api/work-logs${queryParam}`)
      const data = await response.json()
      if (response.ok) {
        setWorkLogs(data.workLogs)
      }
    } catch (error) {
      console.error("Error fetching work logs:", error)
      toast({
        title: "Error",
        description: "Failed to fetch work logs",
        variant: "destructive",
      })
    }
  }

  const fetchProjects = async () => {
    try {
      const response = await fetch("/api/projects")
      const data = await response.json()
      if (response.ok) {
        setProjects(data.projects)
      }
    } catch (error) {
      console.error("Error fetching projects:", error)
    }
  }

  const fetchUsers = async () => {
    try {
      const response = await fetch("/api/users")
      const data = await response.json()
      if (response.ok) {
        setUsers(data.users || data)
      }
    } catch (error) {
      console.error("Error fetching users:", error)
    }
  }

  const handleOpenDialog = useCallback((workLog?: WorkLog) => {
    if (workLog) {
      setSelectedWorkLog(workLog)
      setFormData({
        description: workLog.description || "",
        remarks: workLog.remarks || "",
        hours: workLog.hours.toString(),
        date: formatDate(workLog.date),
        projectId: workLog.project?.id || "",
        workItemId: workLog.workItem?.id || "",
        status: workLog.status || "To Do",
      })
    } else {
      setSelectedWorkLog(null)
      setFormData(emptyWorkLogForm(date ? formatDate(date) : formatDate(new Date())))
    }
    setIsDialogOpen(true)
  }, [date])

  const handleSubmit = useCallback(async () => {
    if (!formData.hours || !formData.description || !formData.projectId || !formData.workItemId) {
      toast({
        title: "Validation Error",
        description: "Please fill in date, hours, project, work item, and description",
        variant: "destructive",
      })
      return
    }

    if (Number.parseFloat(formData.hours) > 24) {
      toast({
        title: "Validation Error",
        description: "Hours cannot exceed 24",
        variant: "destructive",
      })
      return
    }

    setIsLoading(true)

    try {
      const url = selectedWorkLog ? `/api/work-logs/${selectedWorkLog.id}` : "/api/work-logs"
      const method = selectedWorkLog ? "PATCH" : "POST"

      // Get Admin user ID as default (Wasant P.)
      const adminUser = users.find(u => u.role === 'Admin')
      const userId = selectedWorkLog?.user.id || adminUser?.id || users[0]?.id

      if (!userId) {
        toast({
          title: "Error",
          description: "No user found. Please wait for users to load.",
          variant: "destructive",
        })
        setIsLoading(false)
        return
      }

      console.log('Submitting work log:', { description: formData.description, hours: formData.hours, date: formData.date, projectId: formData.projectId, status: formData.status, userId })

      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          description: formData.description,
          remarks: formData.remarks,
          hours: formData.hours,
          date: formData.date,
          projectId: formData.projectId,
          workItemId: formData.workItemId,
          status: formData.status,
          userId,
        }),
      })

      const data = await response.json()

      if (response.ok) {
        toast({
          title: "Success",
          description: `Work log ${selectedWorkLog ? "updated" : "created"} successfully`,
        })
        setIsDialogOpen(false)
        fetchWorkLogs()
      } else {
        throw new Error(data.error)
      }
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to save work log",
        variant: "destructive",
      })
    } finally {
      setIsLoading(false)
    }
  }, [formData, selectedWorkLog, users])

  const handleDelete = useCallback(async (id: string) => {
    if (!confirm("Are you sure you want to delete this work log?")) {
      return
    }

    try {
      const response = await fetch(`/api/work-logs/${id}`, {
        method: "DELETE",
      })

      if (response.ok) {
        toast({
          title: "Success",
          description: "Work log deleted successfully",
        })
        setIsDetailsDialogOpen(false)
        fetchWorkLogs()
      } else {
        throw new Error("Failed to delete work log")
      }
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      })
    }
  }, [])

  const handleViewDetails = useCallback((workLog: WorkLog) => {
    setSelectedWorkLog(workLog)
    setIsDetailsDialogOpen(true)
  }, [])

  // Filter work logs based on search query
  const filteredWorkLogs = useMemo(() => {
    if (!searchQuery.trim()) {
      return workLogs
    }

    const query = searchQuery.toLowerCase()
    return workLogs.filter((log) => {
      const matchesDescription = log.description?.toLowerCase().includes(query)
      const matchesUserName = log.user.name.toLowerCase().includes(query)
      const matchesProjectName = log.project?.name.toLowerCase().includes(query)
      const matchesStatus = log.status?.toLowerCase().includes(query)

      const matchesWorkItem = log.workItem?.title.toLowerCase().includes(query)

      return matchesDescription || matchesUserName || matchesProjectName || matchesStatus || matchesWorkItem
    })
  }, [workLogs, searchQuery])

  const totalHours = filteredWorkLogs.reduce((sum, log) => sum + Number(log.hours), 0)
  const totalTasks = filteredWorkLogs.length

  // Generate button label based on view period
  const buttonLabel = useMemo(() => {
    if (!date) return 'All'

    switch (viewPeriod) {
      case "day":
        return formatDate(date)
      case "week": {
        const start = new Date(date)
        start.setDate(start.getDate() - start.getDay())
        const end = new Date(date)
        end.setDate(end.getDate() + (6 - end.getDay()))
        const wk_start = start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
        const wk_end = end.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
        return `Week of [ ${wk_start} - ${wk_end}]`
      }
      case "month":
        return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
      case "year":
        return date.getFullYear().toString()
      default:
        return formatDate(date)
    }
  }, [date, viewPeriod])

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <AppHeader />
        <main className={PAGE_MAIN}>
          <div className={PAGE_INNER}>
            <div className={PAGE_TOOLBAR}>
              <div className="min-w-0">
                <h1 className={PAGE_HEADING}>Daily Work</h1>
                <p className={PAGE_LEAD}>Track your daily activities and work logs</p>
              </div>
              <ToggleGroup
                type="single"
                value={viewPeriod}
                onValueChange={(value) => value && setViewPeriod(value as "day" | "week" | "month" | "year")}
                className="w-full justify-start overflow-x-auto sm:w-auto"
              >
                <ToggleGroupItem value="day" aria-label="Day view">Day</ToggleGroupItem>
                <ToggleGroupItem value="week" aria-label="Week view">Week</ToggleGroupItem>
                <ToggleGroupItem value="month" aria-label="Month view">Month</ToggleGroupItem>
                <ToggleGroupItem value="year" aria-label="Year view">Year</ToggleGroupItem>
              </ToggleGroup>
              <Button className="w-full sm:w-auto" onClick={() => handleOpenDialog()}>
                <Plus className="h-4 w-4" />
                <span className="truncate">
                  <span className="sm:hidden">Add</span>
                  <span className="hidden sm:inline">Add Work Log : {date ? formatDate(date) : buttonLabel}</span>
                </span>
              </Button>
            </div>

            <div className="grid gap-6 lg:grid-cols-3">
              {/* Calendar and Stats */}
              <div className="space-y-4">
                <Card className="card-shadow">
                  <Calendar
                    selectedDate={date}
                    onDateChange={(newDate) => setDate(newDate || undefined)}
                    className="rounded-md"
                  />
                </Card>

                <StatsCard
                  totalHours={totalHours}
                  totalLogs={totalTasks}
                  date={date}
                />
              </div>

              {/* Work Logs */}
              <div className="space-y-4 lg:col-span-2">
                <WorkLogList
                  workLogs={filteredWorkLogs}
                  date={date}
                  searchQuery={searchQuery}
                  onSearchChange={setSearchQuery}
                  onWorkLogClick={handleViewDetails}
                  onAddClick={() => handleOpenDialog()}
                  buttonLabel={buttonLabel}
                />
              </div>
            </div>
          </div>
        </main>

        {/* Add/Edit Work Log Dialog */}
        <WorkLogDialog
          open={isDialogOpen}
          onOpenChange={setIsDialogOpen}
          mode={selectedWorkLog ? "edit" : "add"}
          isLoading={isLoading}
          formData={formData}
          onFormDataChange={setFormData}
          projects={projects}
          onSubmit={handleSubmit}
          onViewDetails={() => {
            setIsDialogOpen(false)
            setIsDetailsDialogOpen(true)
          }}
        />

        {/* Work Log Details Dialog */}
        <WorkLogDialog
          open={isDetailsDialogOpen}
          onOpenChange={setIsDetailsDialogOpen}
          mode="view"
          workLog={selectedWorkLog}
          onEdit={handleOpenDialog}
          onDelete={handleDelete}
        />
      </SidebarInset>
    </SidebarProvider >
  )
}
