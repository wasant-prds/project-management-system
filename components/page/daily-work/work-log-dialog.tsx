"use client"

import { useEffect, useMemo, useState } from "react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { DIALOG_SHELL_WIDE_CLASS } from "@/components/ui/responsive-dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { Clock, Edit, Eye, FileText, MessageSquareText, Trash2, type LucideIcon } from "lucide-react"
import { formatDate } from "@/lib/utils"
import { WORK_ITEM_STATUS_LABELS, type WorkItemKindValue, type WorkItemStatusValue } from "@/lib/work-items"
import { kindClass } from "@/components/page/work-items/work-item-presentation"
import { ProjectIdentity } from "@/components/page/work-items/project-identity"
import { WorkItemDescription } from "@/components/page/work-items/work-item-description"
import { Project, WorkLogFormData, WorkLog, WorkLogWorkItem, workLogStatuses } from "./types"
import { SearchSelect } from "./work-log-search-select"
import { ScrollablePanel } from "@/components/ui/scrollable-panel"

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

const BODY_PANEL_CLASS =
  "min-h-0 min-w-0 flex-1 rounded-xl border border-border/70 bg-muted/30 shadow-inner"
const BODY_COPY_CLASS =
  "rounded-none border-0 bg-transparent px-4 py-3 text-sm font-normal leading-relaxed text-foreground break-words"

function BodyCopy({
  id,
  isView,
  viewText,
  emptyLabel,
  value,
  placeholder,
  onChange,
  disabled,
}: Readonly<{
  id: string
  isView: boolean
  viewText?: string | null
  emptyLabel: string
  value?: string
  placeholder: string
  onChange?: (value: string) => void
  disabled?: boolean
}>) {
  if (isView && viewText?.trim()) {
    return <WorkItemDescription text={viewText} className={BODY_COPY_CLASS} />
  }
  if (isView) {
    return <p className="px-4 py-6 text-sm italic text-muted-foreground">{emptyLabel}</p>
  }
  return (
    <Textarea
      id={id}
      placeholder={placeholder}
      value={value || ""}
      onChange={(event) => onChange?.(event.target.value)}
      className={`${BODY_COPY_CLASS} h-full min-h-0 resize-none`}
      disabled={disabled}
    />
  )
}

function BodySection({
  id,
  label,
  icon: Icon,
  required = false,
  isView,
  viewText,
  emptyLabel,
  value,
  placeholder,
  onChange,
  disabled,
  growClass,
}: Readonly<{
  id: string
  label: string
  icon: LucideIcon
  required?: boolean
  isView: boolean
  viewText?: string | null
  emptyLabel: string
  value?: string
  placeholder: string
  onChange?: (value: string) => void
  disabled?: boolean
  growClass: string
}>) {
  return (
    <div className={`flex min-h-0 min-w-0 flex-col overflow-hidden ${growClass}`}>
      <div className="mb-2 flex shrink-0 items-center gap-2 text-muted-foreground">
        <Icon className="h-3.5 w-3.5" />
        <Label htmlFor={id} className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
          {label}
          {required && !isView && <span className="text-destructive"> *</span>}
        </Label>
      </div>
      <ScrollablePanel className={BODY_PANEL_CLASS}>
        <BodyCopy
          id={id}
          isView={isView}
          viewText={viewText}
          emptyLabel={emptyLabel}
          value={value}
          placeholder={placeholder}
          onChange={onChange}
          disabled={disabled}
        />
      </ScrollablePanel>
    </div>
  )
}

function DetailsAndRemarks({
  isView,
  isLoading,
  workLog,
  formData,
  onFormDataChange,
}: Readonly<{
  isView: boolean
  isLoading: boolean
  workLog?: WorkLog | null
  formData?: WorkLogFormData
  onFormDataChange?: (data: WorkLogFormData) => void
}>) {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden">
      <BodySection
        id="description"
        label="Details"
        icon={FileText}
        required
        growClass="flex-[3]"
        isView={isView}
        viewText={workLog?.description}
        emptyLabel="No description"
        value={formData?.description}
        placeholder="Describe the work you completed..."
        onChange={(description) => onFormDataChange?.({ ...formData!, description })}
        disabled={isLoading}
      />
      <BodySection
        id="remarks"
        label="Remarks"
        icon={MessageSquareText}
        growClass="flex-[7]"
        isView={isView}
        viewText={workLog?.remarks}
        emptyLabel="No remarks"
        value={formData?.remarks}
        placeholder="Any additional notes or observations..."
        onChange={(remarks) => onFormDataChange?.({ ...formData!, remarks })}
        disabled={isLoading}
      />
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
      <DialogContent className={DIALOG_SHELL_WIDE_CLASS}>
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

        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden px-4 py-4 sm:px-6 sm:py-5">
          {isViewMode && workLog ? (
            <>
              <div className="flex shrink-0 flex-wrap items-start justify-between gap-3 border-b border-border/60 pb-3">
                <div className="min-w-0 space-y-1.5">
                  <DialogTitle className="text-left text-lg leading-snug tracking-tight sm:text-xl">
                    {workLog.workItem?.title || workLog.description || "Work log"}
                  </DialogTitle>
                  <div className="flex flex-wrap items-center gap-2">
                    {workLog.workItem && (
                      <Badge variant="outline" className={kindClass(workLog.workItem.kind as WorkItemKindValue)}>
                        {workLog.workItem.kind}
                      </Badge>
                    )}
                    {workLog.status && <Badge variant="secondary">{workLog.status}</Badge>}
                    <span className="text-sm text-muted-foreground">{workLog.user.name}</span>
                    <span className="text-xs text-muted-foreground">{formatDate(workLog.date)}</span>
                  </div>
                  <DialogDescription className="sr-only">Work log details</DialogDescription>
                </div>
                <Badge variant="outline" className="shrink-0 gap-1">
                  <Clock className="h-3 w-3" />
                  {workLog.hours}h
                </Badge>
              </div>
              <DetailsAndRemarks
                isView
                isLoading={isLoading}
                workLog={workLog}
                formData={formData}
                onFormDataChange={onFormDataChange}
              />
            </>
          ) : (
            <div className="grid min-h-0 flex-1 grid-rows-1 gap-6 md:grid-cols-2">
              <div className="min-h-0 space-y-4 overflow-y-auto pr-1">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="date">Date <span className="text-destructive">*</span></Label>
                    <Input
                      id="date"
                      type="date"
                      value={formData?.date || ""}
                      onChange={(event) => onFormDataChange?.({ ...formData!, date: event.target.value })}
                      disabled={isLoading}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="hours">Hours <span className="text-destructive">*</span></Label>
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
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Project <span className="text-destructive">*</span></Label>
                  <SearchSelect
                    value={formData?.projectId || ""}
                    options={projectOptions}
                    onSelect={handleProjectSelect}
                    placeholder="Select project..."
                    searchPlaceholder="Search projects..."
                    emptyText="No project found."
                    disabled={isLoading}
                  />
                </div>

                <div className="space-y-2">
                  <Label>Work item <span className="text-destructive">*</span></Label>
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
                </div>

                <div className="space-y-2">
                  <Label htmlFor="status">Status <span className="text-destructive">*</span></Label>
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
                </div>
              </div>

              <DetailsAndRemarks
                isView={false}
                isLoading={isLoading}
                workLog={workLog}
                formData={formData}
                onFormDataChange={onFormDataChange}
              />
            </div>
          )}
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
