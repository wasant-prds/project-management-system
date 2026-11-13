'use client'

import { useCallback, useMemo, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Plus, Eye, FileText } from "lucide-react"
import { WorkLog } from "./types"
import { WorkLogCard } from "./work-log-card"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { DIALOG_SHELL_WIDE_CLASS } from "@/components/ui/responsive-dialog"
import { WorkItemDescription } from "@/components/page/work-items/work-item-description"
import { formatBangkokDateLabel } from "@/lib/bangkok-datetime"
import { formatUiDate } from '@/lib/display-date'
import { PageState } from '@/components/layout/page-state'
import { DataTransferMenu } from '@/components/layout/data-transfer-menu'
import { formatHours } from '@/lib/decimal-hours'

// Constants
const DEFAULT_PROJECT_COLOR = "var(--project-accent)"
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
    formatHours(log.hours),
    formatBangkokDateLabel(log.date),
    log.description || "",
    log.remarks || "",
    log.status || "",
  ]
  return fields.map(escapeCSVField).join(",")
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
  searchQuery: string
  onWorkLogClick: (workLog: WorkLog) => void
  onAddClick: () => void
  buttonLabel: string
  periodLabel?: string
}

function useWorkLogExports(workLogs: WorkLog[], buttonLabel: string) {
  // Memoize grouped work logs to avoid recalculating on every render
  const groupedByProject = useMemo(
    () => groupWorkLogsByProject(workLogs),
    [workLogs]
  )

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

  return { groupedByProject, exportToCSV, exportToMarkdown }
}

export function WorkLogExportMenu({ workLogs, buttonLabel, disabled = false }: Readonly<{ workLogs: WorkLog[]; buttonLabel: string; disabled?: boolean }>) {
  const { exportToCSV, exportToMarkdown } = useWorkLogExports(workLogs, buttonLabel)
  return <DataTransferMenu exports={[
    { format: 'CSV', label: 'Export CSV', onSelect: exportToCSV, disabled: disabled || workLogs.length === 0 },
    { format: 'Markdown', label: 'Export Markdown', onSelect: exportToMarkdown, disabled: disabled || workLogs.length === 0 },
  ]} />
}

export function WorkLogList({
  workLogs,
  searchQuery,
  onWorkLogClick,
  onAddClick,
  buttonLabel,
  periodLabel = buttonLabel,
}: Readonly<WorkLogListProps>) {
  const [isViewModalOpen, setIsViewModalOpen] = useState(false)

  const { groupedByProject, exportToMarkdown } = useWorkLogExports(workLogs, buttonLabel)
  const handleOpenModal = useCallback(() => setIsViewModalOpen(true), [])

  return (
    <div className="motion-data-enter space-y-3">
      <Card className="card-shadow py-3">
        <CardHeader className="px-4 py-0">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle className="text-base">
              บันทึกงาน: <span className="font-bold text-link">{periodLabel}</span>
            </CardTitle>
            {workLogs.length > 0 && (
              <div className="flex flex-wrap gap-2">
                <Button
                  onClick={handleOpenModal}
                  variant="neutral"
                  size="sm"
                  aria-label="ดูบันทึกงานรวมตาม Project"
                >
                  <Eye className="h-4 w-4" />
                  <span>ดูรวม</span>
                </Button>
              </div>
            )}
          </div>
        </CardHeader>
      </Card>
      {workLogs.length === 0 ? (
        <PageState visual={searchQuery.trim() ? 'search' : 'activity'} title={searchQuery.trim() ? 'ไม่พบ Daily Work ที่ตรงกับคำค้นหา' : 'ยังไม่มี Daily Work ในวันที่เลือก'}
          description={searchQuery.trim() ? 'ลองเปลี่ยนคำค้นหาเพื่อดูบันทึกอื่น' : 'เพิ่มบันทึกเวลาทำงานของ Work Item ในวันที่เลือก'}
          action={<Button type="button" className="gap-2" onClick={onAddClick}>
              <Plus className="h-4 w-4" />
              เพิ่มบันทึกงาน
            </Button>}
        />
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
                  บันทึกงาน: <span className="text-link">{periodLabel}</span>
                </DialogTitle>
                <DialogDescription>
                  บันทึกจาก {groupedByProject.length} Projects เรียงตาม # ในรายละเอียดหรือหมายเหตุ แล้วตามวันที่
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
                <div className="sticky top-0 z-10 border-b-2 border-info bg-card pb-2">
                  <div className="flex min-w-0 items-start justify-between gap-2">
                    <h3 className="content-wrap min-w-0 text-base font-semibold text-link flex items-start gap-2">
                      <div
                        className="mt-1 h-3 w-3 shrink-0 rounded-full"
                        style={{
                          backgroundColor: logs[0]?.project?.colorProject || DEFAULT_PROJECT_COLOR
                        }}
                      />
                      {projectName}
                    </h3>
                    <Badge variant="secondary" className="text-sm">
                      {logs.length} รายการ
                    </Badge>
                  </div>
                </div>

                {/* Work Logs for this project */}
                <div className="space-y-3">
                  {logs.map((log) => (
                    <Card
                      key={log.id}
                      className="border-l-4"
                      style={{
                        borderLeftColor: log.project?.colorProject || DEFAULT_PROJECT_COLOR
                      }}
                    >
                      <CardContent className="pt-4">
                        <div className="space-y-3">
                          {/* Header Row */}
                          <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
                            <div className="min-w-0 flex-1 basis-full space-y-1 sm:basis-64">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-semibold text-sm text-muted-foreground">งาน:</span>
                                <Badge variant="outline" className="content-wrap min-w-0 max-w-full justify-start whitespace-normal text-left font-normal">
                                  {log.workItem?.title || "No work item"}
                                </Badge>
                                {log.workItem?.kind && (
                                  <Badge variant="secondary" className="font-normal">
                                    {log.workItem.kind}
                                  </Badge>
                                )}
                              </div>
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-semibold text-sm text-muted-foreground">ผู้บันทึก:</span>
                                <span className="font-medium">{log.user.name}</span>
                                <span className="content-wrap min-w-0 text-xs text-muted-foreground">({log.user.email})</span>
                              </div>
                            </div>
                            <div className="min-w-0 max-w-full space-y-1 text-right">
                              <div className="flex items-center gap-2">
                                <Badge variant="secondary" className="content-wrap max-w-full whitespace-normal font-semibold tabular-nums">
                                  {formatHours(log.hours)} ชม.
                                </Badge>
                              </div>
                              <div className="text-xs text-muted-foreground">
                                {formatUiDate(log.date)}
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
                              <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">รายละเอียด</div>
                              <WorkItemDescription
                                text={log.description}
                                className="text-foreground"
                              />
                            </div>
                          )}

                          {log.remarks && (
                            <div className="space-y-1">
                              <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">หมายเหตุ</div>
                              <WorkItemDescription
                                text={log.remarks}
                                className="text-foreground"
                              />
                            </div>
                          )}

                          {/* Show placeholders if no description or remarks */}
                          {!log.description && !log.remarks && (
                            <div className="text-xs text-muted-foreground italic">
                              ไม่มีรายละเอียดหรือหมายเหตุ
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

