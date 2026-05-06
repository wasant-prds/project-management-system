import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Plus, Search, Download, Eye } from "lucide-react"
import { WorkLog } from "./types"
import { WorkLogCard } from "./work-log-card"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { useState, useMemo, useCallback } from "react"

// Constants
const DEFAULT_PROJECT_COLOR = "#3b82f6"
const CSV_HEADER = "Project,Task,User,User Email,Hours,Date,Description,Remarks,Status"

// Utility functions
const getProjectName = (log: WorkLog): string => log.project?.name || "No Project"
const getTaskTitle = (log: WorkLog): string => log.task?.title || "No Task"

const sortLogsByTaskUserDate = (a: WorkLog, b: WorkLog, dateOrder: "asc" | "desc" = "asc"): number => {
  const taskA = getTaskTitle(a)
  const taskB = getTaskTitle(b)
  if (taskA !== taskB) return taskA.localeCompare(taskB)

  const userA = a.user.name
  const userB = b.user.name
  if (userA !== userB) return userA.localeCompare(userB)

  const dateA = new Date(a.date).getTime()
  const dateB = new Date(b.date).getTime()
  return dateOrder === "asc" ? dateA - dateB : dateB - dateA
}

const sortLogsByProjectTaskUserDate = (a: WorkLog, b: WorkLog, dateOrder: "asc" | "desc" = "asc"): number => {
  const projectA = getProjectName(a)
  const projectB = getProjectName(b)
  if (projectA !== projectB) return projectA.localeCompare(projectB)

  return sortLogsByTaskUserDate(a, b, dateOrder)
}

const groupWorkLogsByProject = (logs: WorkLog[]): Array<[string, WorkLog[]]> => {
  const grouped = new Map<string, WorkLog[]>()

  logs.forEach((log) => {
    const projectName = getProjectName(log)
    if (!grouped.has(projectName)) {
      grouped.set(projectName, [])
    }
    grouped.get(projectName)!.push(log)
  })

  // Sort logs within each project
  grouped.forEach((projectLogs) => {
    projectLogs.sort((a, b) => sortLogsByTaskUserDate(a, b, "asc"))
  })

  // Sort projects alphabetically and return as array
  return Array.from(grouped.entries()).sort((a, b) => a[0].localeCompare(b[0]))
}

const escapeCSVField = (field: string): string => {
  return `"${field.replaceAll('"', '""')}"`
}

const generateCSVRow = (log: WorkLog): string => {
  const fields = [
    getProjectName(log),
    getTaskTitle(log),
    log.user.name,
    log.user.email,
    log.hours.toString(),
    new Date(log.date).toLocaleDateString(),
    log.description || "",
    log.remarks || "",
    log.status || "",
  ]
  return fields.map(escapeCSVField).join(",")
}

type WorkLogListProps = {
  workLogs: WorkLog[]
  date?: Date
  searchQuery: string
  onSearchChange: (query: string) => void
  onWorkLogClick: (workLog: WorkLog) => void
  onAddClick: () => void
  buttonLabel: string
}

export function WorkLogList({
  workLogs,
  date,
  searchQuery,
  onSearchChange,
  onWorkLogClick,
  onAddClick,
  buttonLabel,
}: Readonly<WorkLogListProps>) {
  const [isViewModalOpen, setIsViewModalOpen] = useState(false)

  // Memoize grouped work logs to avoid recalculating on every render
  const groupedByProject = useMemo(
    () => groupWorkLogsByProject(workLogs),
    [workLogs]
  )

  // Memoize handlers
  const handleOpenModal = useCallback(() => setIsViewModalOpen(true), [])

  // Memoize CSV export function
  const exportToCSV = useCallback(() => {
    // Sort work logs by project, task, user, and date (newest first)
    const sortedLogs = [...workLogs].sort((a, b) => sortLogsByProjectTaskUserDate(a, b, "desc"))

    // Generate CSV rows
    const csvRows = [CSV_HEADER, ...sortedLogs.map(generateCSVRow)]
    const csvContent = csvRows.join("\n")

    // Create blob and download
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" })
    const link = document.createElement("a")
    const url = URL.createObjectURL(blob)

    // Generate filename based on buttonLabel (date/week/month/year)
    const sanitizedLabel = buttonLabel.replaceAll(/[^a-zA-Z0-9]/g, "_")
    const filename = `work_logs_${sanitizedLabel}_${new Date().toISOString().split("T")[0]}.csv`

    link.setAttribute("href", url)
    link.setAttribute("download", filename)
    link.style.visibility = "hidden"
    document.body.appendChild(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(url)
  }, [workLogs, buttonLabel])

  return (
    <div className="space-y-3">
      <Card className="card-shadow">
        <CardHeader className="pb-0">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">
              Work Logs for : <span className="font-bold text-blue-500">{buttonLabel}</span>
            </CardTitle>
            {workLogs.length > 0 && (
              <div className="flex gap-2">
                <Button
                  onClick={handleOpenModal}
                  variant="default"
                  size="sm"
                  className="gap-2 bg-gray-500 text-white"
                >
                  <Eye className="h-4 w-4 text-white" />
                  View
                </Button>
                <Button
                  onClick={exportToCSV}
                  variant="default"
                  size="sm"
                  className="gap-2 bg-blue-500 text-white"
                >
                  <Download className="h-4 w-4" />
                  Export CSV
                </Button>
              </div>
            )}
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              type="search"
              placeholder="Search work logs..."
              className="pl-10 bg-secondary/50 border-border/50"
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
            />
          </div>
        </CardHeader>
      </Card>
      {workLogs.length === 0 ? (
        <Card className="card-shadow">
          <CardContent className="py-10 text-center">
            <p className="text-muted-foreground">
              {searchQuery.trim() ? 'No work logs match your search.' : 'No work logs for this date.'}
            </p>
            <Button className="mt-4 gap-2" onClick={onAddClick}>
              <Plus className="h-4 w-4" />
              Add Work Log
            </Button>
          </CardContent>
        </Card>
      ) : (
        workLogs.map((log) => (
          <WorkLogCard key={log.id} workLog={log} onClick={onWorkLogClick} />
        ))
      )}

      <Dialog open={isViewModalOpen} onOpenChange={setIsViewModalOpen}>
        <DialogContent className="!max-w-[80vw] w-full max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="text-2xl font-bold">
              Work Logs for: <span className="text-blue-500">{buttonLabel}</span>
            </DialogTitle>
            <DialogDescription>
              View all work logs grouped by project ( <span className="font-bold text-blue-500">{groupedByProject.length}</span> projects )
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto pr-2 space-y-6 mt-4">
            {groupedByProject.map(([projectName, logs], projectIndex, allProjects) => (
              <div key={projectName} className="space-y-4">
                {/* Project Header */}
                <div className="sticky top-0 bg-background z-10 pb-2 border-b-2 border-blue-500">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xl font-bold text-blue-600 dark:text-blue-400 flex items-center gap-2">
                      <div
                        className="w-4 h-4 rounded-full"
                        style={{
                          backgroundColor: logs[0]?.project?.colorProject || DEFAULT_PROJECT_COLOR
                        }}
                      />
                      {projectName}
                    </h3>
                    <Badge variant="secondary" className="text-sm">
                      {logs.length} {logs.length === 1 ? 'entry' : 'entries'}
                    </Badge>
                  </div>
                </div>

                {/* Work Logs for this project */}
                <div className="space-y-4 pl-4">
                  {logs.map((log) => (
                    <Card
                      key={log.id}
                      className="border-l-4 shadow-sm"
                      style={{
                        borderLeftColor: log.project?.colorProject || DEFAULT_PROJECT_COLOR
                      }}
                    >
                      <CardContent className="pt-4">
                        <div className="space-y-3">
                          {/* Header Row */}
                          <div className="flex items-start justify-between gap-4">
                            <div className="flex-1 space-y-1">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-semibold text-sm text-muted-foreground">Task:</span>
                                <Badge variant="outline" className="font-normal">
                                  {log.task?.title || "No Task"}
                                </Badge>
                              </div>
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-semibold text-sm text-muted-foreground">User:</span>
                                <span className="font-medium">{log.user.name}</span>
                                <span className="text-xs text-muted-foreground">({log.user.email})</span>
                              </div>
                            </div>
                            <div className="text-right space-y-1">
                              <div className="flex items-center gap-2">
                                <span className="font-semibold text-sm text-muted-foreground">Hours:</span>
                                <Badge variant="secondary" className="font-semibold">
                                  {log.hours}h
                                </Badge>
                              </div>
                              <div className="text-xs text-muted-foreground">
                                {new Date(log.date).toLocaleDateString('en-US', {
                                  weekday: 'short',
                                  year: 'numeric',
                                  month: 'short',
                                  day: 'numeric'
                                })}
                              </div>
                              {log.status && (
                                <Badge variant="outline" className="text-xs mt-1">
                                  {log.status}
                                </Badge>
                              )}
                            </div>
                          </div>

                          <Separator />

                          {/* Description */}
                          {log.description && (
                            <div className="space-y-1">
                              <div className="font-semibold text-sm text-muted-foreground">Description:</div>
                              <div className="text-sm bg-muted/50 p-3 rounded-md border border-border/50 whitespace-pre-wrap">
                                {log.description}
                              </div>
                            </div>
                          )}

                          {/* Remarks */}
                          {log.remarks && (
                            <div className="space-y-1">
                              <div className="font-semibold text-sm text-muted-foreground">Remarks:</div>
                              <div className="text-sm bg-muted/50 p-3 rounded-md border border-border/50 italic whitespace-pre-wrap">
                                {log.remarks}
                              </div>
                            </div>
                          )}

                          {/* Show placeholders if no description or remarks */}
                          {!log.description && !log.remarks && (
                            <div className="text-xs text-muted-foreground italic">
                              No description or remarks provided
                            </div>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>

                {/* Separator between projects */}
                {projectIndex < allProjects.length - 1 && (
                  <Separator className="my-6" />
                )}
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

