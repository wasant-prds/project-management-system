"use client"

import type { ReactNode } from "react"
import { useEffect, useMemo, useState } from "react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Clock, Edit, FileText, Trash2, Eye } from "lucide-react"
import { formatDate } from "@/lib/utils"
import { WORK_ITEM_STATUS_LABELS, type WorkItemKindValue, type WorkItemStatusValue } from "@/lib/work-items"
import { kindClass } from "@/components/page/work-items/work-item-presentation"
import { ProjectIdentity } from "@/components/page/work-items/project-identity"
import { Project, WorkLogFormData, WorkLog, WorkLogWorkItem, workLogStatuses } from "./types"
import { SearchSelect } from "./work-log-search-select"
import { ScrollablePanel } from "@/components/ui/scrollable-panel"

const getNullStyle = (value: unknown) => {
  return !value || value === "" ? "text-amber-700/70 dark:text-amber-600/70 italic" : ""
}

const getDisplayValue = (value: string | null | undefined, placeholder: string) => {
  return value || placeholder
}

type WorkLogDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  mode: "add" | "edit" | "view"
  isLoading?: boolean
  formData?: WorkLogFormData
  workLog?: WorkLog | null
  onFormDataChange?: (data: WorkLogFormData) => void
  projects?: Project[]
  onSubmit?: () => void
  onEdit?: (workLog: WorkLog) => void
  onDelete?: (id: string) => void
  onViewDetails?: () => void
}

function DialogActions({
  isViewMode,
  isEditMode,
  isLoading,
  workLog,
  onOpenChange,
  onEdit,
  onDelete,
  onViewDetails,
  onSubmit,
}: Readonly<{
  isViewMode: boolean
  isEditMode: boolean
  isLoading: boolean
  workLog?: WorkLog | null
  onOpenChange: (open: boolean) => void
  onEdit?: (workLog: WorkLog) => void
  onDelete?: (id: string) => void
  onViewDetails?: () => void
  onSubmit?: () => void
}>) {
  if (isViewMode && workLog) {
    return (
      <>
        <Button
          onClick={() => {
            onOpenChange(false)
            onEdit?.(workLog)
          }}
        >
          <Edit className="mr-2 h-4 w-4" />
          Edit
        </Button>
        <Button variant="destructive" onClick={() => onDelete?.(workLog.id)}>
          <Trash2 className="mr-2 h-4 w-4" />
          Delete
        </Button>
      </>
    )
  }

  let submitButtonText = "Save"
  if (isLoading) submitButtonText = "Saving..."
  else if (isEditMode) submitButtonText = "Update"

  return (
    <>
      {isEditMode && onViewDetails && (
        <Button variant="secondary" onClick={onViewDetails} disabled={isLoading}>
          <Eye className="mr-2 h-4 w-4" />
          View Details
        </Button>
      )}
      <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isLoading}>
        Cancel
      </Button>
      <Button onClick={onSubmit} disabled={isLoading}>
        {submitButtonText}
      </Button>
    </>
  )
}

function FieldPanel({ children, className = "" }: Readonly<{ children: ReactNode; className?: string }>) {
  return (
    <div className={`rounded-lg border border-border/60 bg-muted/30 px-3 py-2.5 ${className}`}>
      {children}
    </div>
  )
}

function useProjectWorkItems(open: boolean, projectId: string, enabled: boolean) {
  const [projectWorkItems, setProjectWorkItems] = useState<WorkLogWorkItem[]>([])
  const [loadingWorkItems, setLoadingWorkItems] = useState(false)

  useEffect(() => {
    if (!open || !projectId || !enabled) {
      if (!projectId) setProjectWorkItems([])
      return
    }

    let cancelled = false
    setLoadingWorkItems(true)
    fetch(`/api/work-items?projectId=${encodeURIComponent(projectId)}`)
      .then(async (response) => {
        const data = await response.json()
        if (!cancelled && response.ok) {
          setProjectWorkItems(data.workItems || [])
        }
      })
      .catch(() => {
        if (!cancelled) setProjectWorkItems([])
      })
      .finally(() => {
        if (!cancelled) setLoadingWorkItems(false)
      })

    return () => {
      cancelled = true
    }
  }, [open, projectId, enabled])

  return { projectWorkItems, loadingWorkItems }
}

export function WorkLogDialog({
  open,
  onOpenChange,
  mode,
  isLoading = false,
  formData,
  workLog,
  onFormDataChange,
  projects = [],
  onSubmit,
  onEdit,
  onDelete,
  onViewDetails,
}: Readonly<WorkLogDialogProps>) {
  const isViewMode = mode === "view"
  const isEditMode = mode === "edit"
  const projectId = isViewMode ? workLog?.project?.id || "" : formData?.projectId || ""
  const { projectWorkItems, loadingWorkItems } = useProjectWorkItems(open, projectId, !isViewMode)

  const projectOptions = useMemo(
    () => projects.map((project) => ({ id: project.id, label: project.name })),
    [projects],
  )

  const workItemOptions = useMemo(
    () =>
      projectWorkItems.map((item) => ({
        id: item.id,
        label: item.title,
        hint: `${item.kind} · ${WORK_ITEM_STATUS_LABELS[item.status as WorkItemStatusValue] || item.status}`,
      })),
    [projectWorkItems],
  )

  const handleProjectSelect = (nextProjectId: string) => {
    if (!onFormDataChange || !formData) return
    onFormDataChange({
      ...formData,
      projectId: nextProjectId,
      workItemId: nextProjectId === formData.projectId ? formData.workItemId : "",
    })
  }

  const handleWorkItemSelect = (workItemId: string) => {
    if (!onFormDataChange || !formData) return
    const selected = projectWorkItems.find((item) => item.id === workItemId)
    onFormDataChange({
      ...formData,
      workItemId,
      description: formData.description.trim() ? formData.description : selected?.title || formData.description,
    })
  }

  if (isViewMode && !workLog) return null

  let dialogTitle = "Add Work Log"
  if (isViewMode) dialogTitle = "Work Log Details"
  else if (isEditMode) dialogTitle = "Edit Work Log"

  const selectedWorkItem = isViewMode
    ? workLog?.workItem
    : projectWorkItems.find((item) => item.id === formData?.workItemId)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[90vh] max-h-[90vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-[72.8rem]">
        {isViewMode && workLog?.project ? (
          <div className="shrink-0">
            <ProjectIdentity name={workLog.project.name} color={workLog.project.colorProject} size="md" />
          </div>
        ) : (
          <DialogHeader className="shrink-0 space-y-1 px-6 pt-6 pr-12">
            <DialogTitle>{dialogTitle}</DialogTitle>
            <DialogDescription>
              {isViewMode
                ? "Review this work log"
                : "Link hours to a project work item"}
            </DialogDescription>
          </DialogHeader>
        )}

        <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-hidden px-6 py-5">
          {isViewMode && workLog && (
            <div className="flex shrink-0 items-start justify-between gap-4">
              <div className="min-w-0 space-y-2">
                <DialogTitle className="text-left text-xl leading-snug tracking-tight">
                  {workLog.workItem?.title || workLog.description || "Work log"}
                </DialogTitle>
                <div className="flex flex-wrap items-center gap-2">
                  {workLog.workItem && (
                    <Badge variant="outline" className={kindClass(workLog.workItem.kind as WorkItemKindValue)}>
                      {workLog.workItem.kind}
                    </Badge>
                  )}
                  {workLog.status && <Badge variant="secondary">{workLog.status}</Badge>}
                </div>
                <DialogDescription className="sr-only">Work log details</DialogDescription>
              </div>
              <div className="flex items-center gap-3">
                <Avatar className="h-10 w-10 border border-primary/20">
                  <AvatarFallback className="bg-primary/10 text-sm font-semibold text-primary">
                    {workLog.user.name.split(" ").map((n) => n[0]).join("").toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <Badge variant="outline" className="gap-1">
                  <Clock className="h-3 w-3" />
                  {workLog.hours}h
                </Badge>
              </div>
            </div>
          )}

          <div className="grid min-h-0 flex-1 grid-rows-1 gap-6 md:grid-cols-2">
            <div className="min-h-0 space-y-4 overflow-visible pr-1">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="date">Date <span className="text-destructive">*</span></Label>
                  {isViewMode && workLog ? (
                    <FieldPanel>
                      <p className="text-sm">{formatDate(workLog.date)}</p>
                    </FieldPanel>
                  ) : (
                    <Input
                      id="date"
                      type="date"
                      value={formData?.date || ""}
                      onChange={(event) => onFormDataChange?.({ ...formData!, date: event.target.value })}
                      disabled={isLoading}
                    />
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="hours">Hours <span className="text-destructive">*</span></Label>
                  {isViewMode && workLog ? (
                    <FieldPanel>
                      <p className="text-sm">{workLog.hours}h</p>
                    </FieldPanel>
                  ) : (
                    <Input
                      id="hours"
                      type="number"
                      min="0.5"
                      max="24"
                      step="0.5"
                      value={formData?.hours || ""}
                      onChange={(event) => onFormDataChange?.({ ...formData!, hours: event.target.value })}
                      disabled={isLoading}
                    />
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <Label>Project <span className="text-destructive">*</span></Label>
                {isViewMode && workLog ? (
                  <FieldPanel>
                    <p className={`text-sm font-medium ${getNullStyle(workLog.project)}`}>
                      {getDisplayValue(workLog.project?.name, "No project")}
                    </p>
                  </FieldPanel>
                ) : (
                  <SearchSelect
                    value={formData?.projectId || ""}
                    options={projectOptions}
                    onSelect={handleProjectSelect}
                    placeholder="Select project..."
                    searchPlaceholder="Search projects..."
                    emptyText="No project found."
                    disabled={isLoading}
                  />
                )}
              </div>

              <div className="space-y-2">
                <Label>Work item <span className="text-destructive">*</span></Label>
                {isViewMode && workLog ? (
                  <FieldPanel>
                    <div className="space-y-1">
                      <p className={`text-sm font-medium ${getNullStyle(workLog.workItem)}`}>
                        {getDisplayValue(workLog.workItem?.title, "No work item")}
                      </p>
                      {workLog.workItem && (
                        <p className="text-xs text-muted-foreground">{workLog.workItem.kind}</p>
                      )}
                    </div>
                  </FieldPanel>
                ) : (
                  <>
                    <SearchSelect
                      value={formData?.workItemId || ""}
                      options={workItemOptions}
                      onSelect={handleWorkItemSelect}
                      placeholder={loadingWorkItems ? "Loading work items..." : "Select work item..."}
                      searchPlaceholder="Search work items..."
                      emptyText="No work items in this project."
                      disabled={isLoading || !formData?.projectId || loadingWorkItems}
                      disabledHint="Select a project first"
                    />
                    {selectedWorkItem && (
                      <Badge variant="outline" className={kindClass(selectedWorkItem.kind as WorkItemKindValue)}>
                        {selectedWorkItem.kind}
                      </Badge>
                    )}
                  </>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="status">Status <span className="text-destructive">*</span></Label>
                {isViewMode && workLog ? (
                  <FieldPanel>
                    <Badge variant="secondary" className={`text-xs ${getNullStyle(workLog.status)}`}>
                      {getDisplayValue(workLog.status, "No status")}
                    </Badge>
                  </FieldPanel>
                ) : (
                  <Select
                    value={formData?.status || ""}
                    onValueChange={(value) => onFormDataChange?.({ ...formData!, status: value })}
                    disabled={isLoading}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Select status" />
                    </SelectTrigger>
                    <SelectContent>
                      {workLogStatuses.map((status) => (
                        <SelectItem key={status} value={status}>{status}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
            </div>

            <div className="flex min-h-0 flex-col gap-3 overflow-hidden">
              <div className="flex min-h-0 flex-[3] flex-col gap-2 overflow-hidden">
                <div className="flex shrink-0 items-center gap-2 text-muted-foreground">
                  <FileText className="h-3.5 w-3.5" />
                  <Label htmlFor="description" className="text-[11px] font-semibold uppercase tracking-[0.16em]">
                    Details { !isViewMode && <span className="text-destructive">*</span> }
                  </Label>
                </div>
                <ScrollablePanel className="flex-1 rounded-xl border border-border/70 bg-muted/30">
                  {isViewMode && workLog ? (
                    <p className={`px-3 py-3 text-sm whitespace-pre-wrap leading-relaxed ${getNullStyle(workLog.description)}`}>
                      {getDisplayValue(workLog.description, "No description")}
                    </p>
                  ) : (
                    <Textarea
                      id="description"
                      placeholder="Describe the work you completed..."
                      value={formData?.description || ""}
                      onChange={(event) => onFormDataChange?.({ ...formData!, description: event.target.value })}
                      className="min-h-full border-0 bg-transparent shadow-none field-sizing-content"
                      disabled={isLoading}
                    />
                  )}
                </ScrollablePanel>
              </div>

              <div className="flex min-h-0 flex-[7] flex-col gap-2 overflow-hidden">
                <Label htmlFor="remarks" className="shrink-0">Remarks</Label>
                <ScrollablePanel className="flex-1 rounded-xl border border-border/70 bg-muted/30">
                  {isViewMode && workLog ? (
                    <p className={`px-3 py-3 text-sm whitespace-pre-wrap ${getNullStyle(workLog.remarks)}`}>
                      {getDisplayValue(workLog.remarks, "No remarks")}
                    </p>
                  ) : (
                    <Textarea
                      id="remarks"
                      placeholder="Any additional notes or observations..."
                      value={formData?.remarks || ""}
                      onChange={(event) => onFormDataChange?.({ ...formData!, remarks: event.target.value })}
                      className="min-h-full border-0 bg-transparent shadow-none field-sizing-content"
                      disabled={isLoading}
                    />
                  )}
                </ScrollablePanel>
              </div>
            </div>
          </div>
        </div>

        <DialogFooter className="shrink-0 gap-2 border-t border-border/60 px-6 py-4">
          <DialogActions
            isViewMode={isViewMode}
            isEditMode={isEditMode}
            isLoading={isLoading}
            workLog={workLog}
            onOpenChange={onOpenChange}
            onEdit={onEdit}
            onDelete={onDelete}
            onViewDetails={onViewDetails}
            onSubmit={onSubmit}
          />
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
