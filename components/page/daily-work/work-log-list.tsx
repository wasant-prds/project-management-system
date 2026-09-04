'use client'

import { useCallback, useMemo, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Plus, Search, Download, Eye, FileText } from "lucide-react"
import { WorkLog } from "./types"
import { WorkLogCard } from "./work-log-card"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { ACTION_LABEL_CLASS } from "@/components/layout/page-layout"
import { DIALOG_SHELL_WIDE_CLASS } from "@/components/ui/responsive-dialog"
import { WorkItemDescription } from "@/components/page/work-items/work-item-description"

// Constants
const DEFAULT_PROJECT_COLOR = "#3b82f6"
const CSV_HEADER = "Project,Work Item,User,User Email,Hours,Date,Description,Remarks,Status"

// Utility functions
const getProjectName = (log: WorkLog): string => log.project?.name || "No Project"
const getWorkTitle = (log: WorkLog): string => log.workItem?.title || log.description || "No description"

const sortLogsByWorkUserDate = (a: WorkLog, b: WorkLog, dateOrder: "asc" | "desc" = "asc"): number => {
  const titleA = getWorkTitle(a)
  const titleB = getWorkTitle(b)
  if (titleA !== titleB) return titleA.localeCompare(titleB)

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

  return sortLogsByWorkUserDate(a, b, dateOrder)
}

/** Smallest #N in description or remarks; null if none (used for ordering). */
const extractMinTagNumber = (log: WorkLog): number | null => {
  const text = `${log.description ?? ""} ${log.remarks ?? ""}`
  const re = /#(\d+)/g
  let match: RegExpExecArray | null
  let min: number | null = null
  while ((match = re.exec(text)) !== null) {
    const n = Number.parseInt(match[1], 10)
    if (!Number.isNaN(n) && (min === null || n < min)) min = n
  }
  return min
}

/** Within a project: by #1, #2, … in description/remarks; entries without tags sort by date (then task for stability). */
const sortLogsByTagOrDate = (a: WorkLog, b: WorkLog): number => {
  const tagA = extractMinTagNumber(a)
  const tagB = extractMinTagNumber(b)
  if (tagA !== null && tagB !== null) {
    const byTag = tagA - tagB
    if (byTag !== 0) return byTag
  } else if (tagA !== null && tagB === null) return -1
  else if (tagA === null && tagB !== null) return 1

  const dateA = new Date(a.date).getTime()
  const dateB = new Date(b.date).getTime()
  if (dateA !== dateB) return dateA - dateB
  return getWorkTitle(a).localeCompare(getWorkTitle(b))
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

  grouped.forEach((projectLogs) => {
    projectLogs.sort(sortLogsByTagOrDate)
  })

  return Array.from(grouped.entries()).sort((a, b) => a[0].localeCompare(b[0]))
}

const escapeCSVField = (field: string): string => {
  return `"${field.replaceAll('"', '""')}"`
}

const generateCSVRow = (log: WorkLog): string => {
  const fields = [
    getProjectName(log),
    log.workItem?.title || "",
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

const formatWorkLogMarkdownBlock = (log: WorkLog): string => {
  const metaLines = [
    `### ${getWorkTitle(log)}`,
    "",
    `- **User:** ${log.user.name} (${log.user.email})`,
    `- **Hours:** ${log.hours}`,
    `- **Date:** ${new Date(log.date).toLocaleDateString()}`,
  ]
  if (log.workItem) metaLines.push(`- **Work item:** ${log.workItem.title} (${log.workItem.kind})`)
  if (log.status) metaLines.push(`- **Status:** ${log.status}`)
  metaLines.push("")

  const sections: string[] = [metaLines.join("\n")]
  if (log.description) sections.push(["**Description**", "", log.description].join("\n"))
  if (log.remarks) sections.push(["**Remarks**", "", log.remarks].join("\n"))
  if (!log.description && !log.remarks) sections.push("_No description or remarks._")
  return sections.join("\n\n")
}

const formatWorkLogMarkdownBlockGroupByProject = (log: WorkLog): string => {
  const sections: string[] = []
  if (log.description) sections.push(["**Description**", "", log.description].join("\n"))
  if (log.remarks) sections.push(["**Remarks**", "", log.remarks].join("\n"))
  if (!log.description && !log.remarks) sections.push("_No description or remarks._")
  return sections.join("\n\n")
}

const generateMarkdownDocument = (
  grouped: Array<[string, WorkLog[]]>,
  titleLabel: string
): string => {
  const exported = new Date().toISOString().split("T")[0]
  const header = [`# Work logs: ${titleLabel}`, "", `_Exported ${exported}._`, ""].join("\n")
  const projectChunks = grouped.map(([projectName, logs]) => {
    const entries = logs.map(formatWorkLogMarkdownBlockGroupByProject).join("\n\n---\n\n")
    return [`## ${projectName}`, "", entries].join("\n")
  })
  return [header, ...projectChunks].join("\n\n") + "\n"
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

  const exportToMarkdown = useCallback(() => {
    const md = generateMarkdownDocument(groupedByProject, buttonLabel)
    const blob = new Blob([md], { type: "text/markdown;charset=utf-8;" })
    const link = document.createElement("a")
    const url = URL.createObjectURL(blob)
    const sanitizedLabel = buttonLabel.replaceAll(/[^a-zA-Z0-9]/g, "_")
    const filename = `work_logs_${sanitizedLabel}_${new Date().toISOString().split("T")[0]}.md`

    link.setAttribute("href", url)
    link.setAttribute("download", filename)
    link.style.visibility = "hidden"
    document.body.appendChild(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(url)
  }, [groupedByProject, buttonLabel])

  return (
    <div className="space-y-3">
      <Card className="card-shadow">
        <CardHeader className="pb-0">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle className="text-base">
              Work Logs for : <span className="font-bold text-blue-700 dark:text-blue-300">{buttonLabel}</span>
            </CardTitle>
            {workLogs.length > 0 && (
              <div className="flex flex-wrap gap-2">
                <Button
                  onClick={handleOpenModal}
                  variant="neutral"
                  size="sm"
                  aria-label="View work logs"
                >
                  <Eye className="h-4 w-4" />
                  <span className={ACTION_LABEL_CLASS}>View</span>
                </Button>
                <Button
                  onClick={exportToCSV}
                  variant="info"
                  size="sm"
                  aria-label="Export CSV"
                >
                  <Download className="h-4 w-4" />
                  <span className={ACTION_LABEL_CLASS}>Export CSV</span>
                </Button>
                <Button
                  onClick={exportToMarkdown}
                  variant="success"
                  size="sm"
                  aria-label="Export Markdown"
                >
                  <FileText className="h-4 w-4" />
                  <span className={ACTION_LABEL_CLASS}>Export Markdown</span>
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
        <DialogContent className={DIALOG_SHELL_WIDE_CLASS}>
          <div className="shrink-0 space-y-3 px-4 pt-4 pr-12 sm:px-6 sm:pt-5">
            <DialogHeader className="flex flex-col gap-3 space-y-0 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
              <div className="min-w-0 space-y-1.5 text-left">
                <DialogTitle className="text-xl font-bold sm:text-2xl">
                  Work Logs for: <span className="text-blue-700 dark:text-blue-300">{buttonLabel}</span>
                </DialogTitle>
                <DialogDescription>
                  View all work logs grouped by project ({' '}
                  <span className="font-bold text-blue-700 dark:text-blue-300">{groupedByProject.length}</span> projects
                  ). Within each project, entries are ordered by # tags in description or remarks, otherwise by date.
                </DialogDescription>
              </div>
              <Button
                type="button"
                onClick={exportToMarkdown}
                variant="success"
                size="sm"
                className="shrink-0 self-start sm:self-auto"
              >
                <FileText className="h-4 w-4" />
                <span className="hidden sm:inline">Export Markdown</span>
                <span className="sm:hidden">Export</span>
              </Button>
            </DialogHeader>
          </div>

          <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-4 pb-4 sm:px-6 sm:pb-5">
            {groupedByProject.map(([projectName, logs], projectIndex, allProjects) => (
              <div key={projectName} className="space-y-4">
                {/* Project Header */}
                <div className="sticky top-0 z-10 border-b-2 border-blue-500 bg-card pb-2">
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
                                <span className="font-semibold text-sm text-muted-foreground">Work item:</span>
                                <Badge variant="outline" className="font-normal">
                                  {log.workItem?.title || "No work item"}
                                </Badge>
                                {log.workItem?.kind && (
                                  <Badge variant="secondary" className="font-normal">
                                    {log.workItem.kind}
                                  </Badge>
                                )}
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

                          {log.description && (
                            <div className="space-y-1">
                              <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Details</div>
                              <WorkItemDescription
                                text={log.description}
                                className="text-foreground"
                              />
                            </div>
                          )}

                          {log.remarks && (
                            <div className="space-y-1">
                              <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Remarks</div>
                              <WorkItemDescription
                                text={log.remarks}
                                className="text-foreground"
                              />
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

