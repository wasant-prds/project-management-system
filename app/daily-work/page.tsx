"use client"

import { AppSidebar } from "@/components/layout/app-sidebar"
import { AppHeader } from "@/components/layout/app-header"
import { useRouter, useSearchParams } from "next/navigation"
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
import { dateOnlyToPickerDate, formatDate } from "@/lib/utils"
import { bangkokCalendarPeriodRange, currentBangkokCalendarDate } from "@/lib/bangkok-datetime"
import { parsePositiveDecimalHours, sumDecimalHours } from "@/lib/decimal-hours"
import { readWorkLogsResponse } from "@/lib/work-log-response"
import { fetchCollection } from "@/lib/fetch-collection"
import { dailyWorkHrefWithoutDashboardFilters } from "@/lib/dashboard-links"
import { WorkLog, Project, WorkLogFormData, emptyWorkLogForm } from "@/components/page/daily-work/types"
import { WorkLogList } from "@/components/page/daily-work/work-log-list"
import { WorkLogDialog } from "@/components/page/daily-work/work-log-dialog"
import { StatsCard } from "@/components/page/daily-work/stats-card"

type ViewPeriod = "day" | "week" | "month" | "year"
type DashboardWorkLogFilters = {
  startDate: string
  endDate: string
  companyId: string | null
  projectId: string | null
  role: string | null
  kind: string | null
}

function workLogQuery(date: Date | undefined, period: ViewPeriod, dashboardFilters: DashboardWorkLogFilters | null) {
  if (dashboardFilters) {
    const params = new URLSearchParams({ startDate: dashboardFilters.startDate, endDate: dashboardFilters.endDate })
    if (dashboardFilters.companyId) params.set("companyId", dashboardFilters.companyId)
    if (dashboardFilters.projectId) params.set("projectId", dashboardFilters.projectId)
    if (dashboardFilters.role) params.set("role", dashboardFilters.role)
    if (dashboardFilters.kind) params.set("kind", dashboardFilters.kind)
    return `?${params.toString()}`
  }
  if (!date) return ""
  if (period === "day") return `?date=${formatDate(date)}`

  const range = bangkokCalendarPeriodRange(formatDate(date), period)
  if (!range) return ""
  return `?startDate=${range.startDate}&endDate=${range.endDate}`
}

function workLogFormError(form: WorkLogFormData) {
  if (!form.date || !form.hours || !form.description || !form.projectId || !form.workItemId) {
    return "Please fill in date, hours, project, work item, and description"
  }
  if (parsePositiveDecimalHours(form.hours) === null) return "Hours must be a positive decimal number"
  return null
}

async function saveWorkLog(form: WorkLogFormData, selected: WorkLog | null) {
  const url = selected ? `/api/work-logs/${selected.id}` : "/api/work-logs"
  const method = selected ? "PATCH" : "POST"
  const response = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      description: form.description,
      remarks: form.remarks,
      hours: form.hours,
      date: form.date,
      projectId: form.projectId,
      workItemId: form.workItemId,
      status: form.status,
    }),
  })
  if (response.ok) return
  const data = await response.json()
  const message = typeof data.error === "string" ? data.error : data.error?.message
  throw new Error(message || "Failed to save work log")
}

export default function DailyWorkPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const searchParamsValue = searchParams.toString()
  const [date, setDate] = useState<Date | undefined>(() => dateOnlyToPickerDate(currentBangkokCalendarDate()) ?? undefined)
  const [workLogs, setWorkLogs] = useState<WorkLog[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [isDetailsDialogOpen, setIsDetailsDialogOpen] = useState(false)
  const [selectedWorkLog, setSelectedWorkLog] = useState<WorkLog | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [searchQuery, setSearchQuery] = useState("")
  const [viewPeriod, setViewPeriod] = useState<ViewPeriod>("day")
  const [dashboardFilters, setDashboardFilters] = useState<DashboardWorkLogFilters | null>(null)
  const [dashboardFiltersReady, setDashboardFiltersReady] = useState(false)

  // Form state
  const [formData, setFormData] = useState<WorkLogFormData>(() => emptyWorkLogForm(currentBangkokCalendarDate()))

  const clearDashboardFilters = useCallback((selectedDate: string | null) => {
    setDashboardFilters(null)
    setDate(selectedDate ? dateOnlyToPickerDate(selectedDate) ?? undefined : undefined)
    router.replace(dailyWorkHrefWithoutDashboardFilters(searchParamsValue, selectedDate), { scroll: false })
  }, [router, searchParamsValue])

  useEffect(() => {
    const params = new URLSearchParams(searchParamsValue)
    const startDate = params.get("startDate")
    const endDate = params.get("endDate")
    const companyId = params.get("companyId")
    const projectId = params.get("projectId")
    const role = params.get("role")
    const kind = params.get("kind")
    setDashboardFilters(startDate && endDate ? { startDate, endDate, companyId, projectId, role, kind } : null)
    const selectedDate = startDate && endDate ? startDate : params.get("date") || currentBangkokCalendarDate()
    setDate(dateOnlyToPickerDate(selectedDate) ?? undefined)
    setDashboardFiltersReady(true)
  }, [searchParamsValue])

  const fetchWorkLogs = useCallback(async () => {
    if (!dashboardFiltersReady) return
    try {
      const response = await fetch(`/api/work-logs${workLogQuery(date, viewPeriod, dashboardFilters)}`)
      const result = await readWorkLogsResponse<WorkLog>(response)
      if (result.error) {
        setWorkLogs([])
        toast({
          title: result.error.title,
          description: result.error.message,
          variant: "destructive",
        })
        return
      }
      setWorkLogs(result.workLogs)
    } catch (error) {
      console.error("Error fetching work logs:", error)
      toast({
        title: "Error",
        description: "Failed to fetch work logs",
        variant: "destructive",
      })
    }
  }, [date, viewPeriod, dashboardFilters, dashboardFiltersReady])

  // Fetch work logs based on selected date and view period.
  useEffect(() => {
    if (dashboardFiltersReady) void fetchWorkLogs()
  }, [fetchWorkLogs, dashboardFiltersReady])

  // Fetch projects on mount.
  useEffect(() => {
    fetchProjects()
  }, [])

  const fetchProjects = async () => {
    try {
      const projectRows = await fetchCollection<Project>("/api/projects", "projects")
      setProjects(projectRows)
    } catch (error) {
      console.error("Error fetching projects:", error)
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
      setFormData(emptyWorkLogForm(date ? formatDate(date) : currentBangkokCalendarDate()))
    }
    setIsDialogOpen(true)
  }, [date])

  const handleSubmit = useCallback(async () => {
    const validationError = workLogFormError(formData)
    if (validationError) {
      toast({
        title: "Validation Error",
        description: validationError,
        variant: "destructive",
      })
      return
    }

    setIsLoading(true)

    try {
      await saveWorkLog(formData, selectedWorkLog)
      toast({
        title: "Success",
        description: `Work log ${selectedWorkLog ? "updated" : "created"} successfully`,
      })
      setIsDialogOpen(false)
      await fetchWorkLogs()
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to save work log",
        variant: "destructive",
      })
    } finally {
      setIsLoading(false)
    }
  }, [fetchWorkLogs, formData, selectedWorkLog])

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
        await fetchWorkLogs()
      } else {
        throw new Error("Failed to delete work log")
      }
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to delete work log",
        variant: "destructive",
      })
    }
  }, [fetchWorkLogs])

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

  const totalHours = sumDecimalHours(filteredWorkLogs.map((log) => log.hours))
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
                <p className="page-eyebrow mb-2">Daily journal</p>
                <h1 className={PAGE_HEADING}>Daily Work</h1>
                <p className={PAGE_LEAD}>บันทึกเวลาทำงานและติดตามกิจกรรมในแต่ละวัน</p>
              </div>
            {dashboardFilters && (
              <Card className="card-shadow">
                <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
                  <p className="text-muted-foreground">
                    ตัวกรองจาก Dashboard: {dashboardFilters.startDate} – {dashboardFilters.endDate}
                    {dashboardFilters.companyId ? ` · Company ${dashboardFilters.companyId}` : ""}
                    {dashboardFilters.projectId ? ` · Project ${dashboardFilters.projectId}` : ""}
                    {dashboardFilters.role ? ` · role ${dashboardFilters.role}` : ""}
                    {dashboardFilters.kind ? ` · ${dashboardFilters.kind}` : ""}
                  </p>
                  <button type="button" onClick={() => clearDashboardFilters(currentBangkokCalendarDate())} className="text-link underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">ล้างตัวกรอง Dashboard</button>
                </div>
              </Card>
            )}
              <ToggleGroup
                type="single"
                value={viewPeriod}
              onValueChange={(value) => {
                if (!value) return
                clearDashboardFilters(date ? formatDate(date) : null)
                setViewPeriod(value as ViewPeriod)
              }}
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
                    onDateChange={(newDate) => {
                      clearDashboardFilters(newDate ? formatDate(newDate) : null)
                      setDate(newDate || undefined)
                    }}
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
