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
import { DatePicker } from "@/components/ui/date-picker"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { Clock, Edit, Eye, FileText, MessageSquareText, Trash2, type LucideIcon } from "lucide-react"
import { formatUiDate } from '@/lib/display-date'
import { WORK_ITEM_STATUS_LABELS, type WorkItemKindValue, type WorkItemStatusValue } from "@/lib/work-items"
import { kindClass } from "@/components/page/work-items/work-item-presentation"
import { ProjectIdentity } from "@/components/page/work-items/project-identity"
import { WorkItemDescription } from "@/components/page/work-items/work-item-description"
import { Project, WorkLogFormData, WorkLog, WorkLogWorkItem, workLogStatuses } from "./types"
import { SearchSelect } from "./work-log-search-select"
import { fetchCollection } from "@/lib/fetch-collection"
import { formatHours } from '@/lib/decimal-hours'

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
          disabled={isLoading}
          onClick={() => {
            onOpenChange(false)
            onEdit?.(workLog)
          }}
        >
          <Edit className="mr-2 h-4 w-4" />
          แก้ไข
        </Button>
        <Button variant="destructive" disabled={isLoading} onClick={() => onDelete?.(workLog.id)}>
          <Trash2 className="mr-2 h-4 w-4" />
          {isLoading ? "กำลังลบ…" : "ลบ"}
        </Button>
      </>
    )
  }

  let submitButtonText = "บันทึก"
  if (isLoading) submitButtonText = "กำลังบันทึก…"
  else if (isEditMode) submitButtonText = "บันทึกการแก้ไข"

  return (
    <>
      {isEditMode && onViewDetails && (
        <Button variant="secondary" onClick={onViewDetails} disabled={isLoading}>
          <Eye className="mr-2 h-4 w-4" />
          ดูรายละเอียด
        </Button>
      )}
      <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isLoading}>
        ยกเลิก
      </Button>
      <Button onClick={onSubmit} disabled={isLoading}>
        {submitButtonText}
      </Button>
    </>
  )
}

const BODY_COPY_CLASS =
  "content-wrap rounded-none border-0 bg-transparent px-4 py-3 text-base font-normal leading-relaxed text-foreground [&_h4]:text-base [&_h4]:normal-case [&_h4]:tracking-normal [&_table]:w-full [&_table]:min-w-[32rem] [&_table]:[overflow-wrap:normal] [&_th]:whitespace-nowrap [&_code]:text-sm"

function BodyCopy({
  id,
  isView,
  viewText,
  emptyLabel,
  value,
  placeholder,
  onChange,
  disabled,
  primary,
}: Readonly<{
  id: string
  isView: boolean
  viewText?: string | null
  emptyLabel: string
  value?: string
  placeholder: string
  onChange?: (value: string) => void
  disabled?: boolean
  primary: boolean
}>) {
  if (isView && viewText?.trim()) {
    return <WorkItemDescription text={viewText} className={`${BODY_COPY_CLASS} ${primary ? '' : 'font-medium'}`} />
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
      rows={primary ? 10 : 2}
      className={`${BODY_COPY_CLASS} flex-1 resize-y bg-input shadow-none sm:text-base ${primary ? 'min-h-60 field-sizing-fixed' : 'min-h-[4.5rem] field-sizing-content font-medium'}`}
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
  primary = false,
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
  primary?: boolean
}>) {
  return (
    <section aria-labelledby={`${id}-label`} className={`flex min-w-0 flex-col ${primary ? 'flex-1' : 'shrink-0'}`}>
      <div className="mb-2 flex shrink-0 items-center gap-2">
        <Icon className={`h-4 w-4 ${primary ? 'text-primary' : 'text-muted-foreground'}`} />
        <Label id={`${id}-label`} htmlFor={isView ? undefined : id} className={primary ? 'text-base font-semibold text-foreground' : 'text-sm font-medium text-muted-foreground'}>
          {label}
          {required && !isView && <span className="text-danger"> *</span>}
        </Label>
      </div>
      <div className={`min-w-0 overflow-hidden rounded-xl border ${primary ? 'flex min-h-60 flex-1 flex-col border-primary/25' : 'border-border/70'} ${isView ? 'bg-muted/20' : 'bg-input shadow-input has-[textarea:disabled]:border-border has-[textarea:disabled]:bg-disabled has-[textarea:disabled]:shadow-none has-[textarea:focus-visible]:border-ring'}`}>
        <BodyCopy
          id={id}
          isView={isView}
          viewText={viewText}
          emptyLabel={emptyLabel}
          value={value}
          placeholder={placeholder}
          onChange={onChange}
          disabled={disabled}
          primary={primary}
        />
      </div>
    </section>
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
    <div className="flex min-w-0 flex-1 flex-col gap-4">
      <BodySection
        id="description"
        label="รายละเอียด"
        icon={FileText}
        required
        isView={isView}
        viewText={workLog?.description}
        emptyLabel="ไม่มีรายละเอียด"
        value={formData?.description}
        placeholder="สรุปงานที่ทำในวันนี้…"
        onChange={(description) => onFormDataChange?.({ ...formData!, description })}
        disabled={isLoading}
      />
      <BodySection
        id="remarks"
        label="หมายเหตุ"
        icon={MessageSquareText}
        primary
        isView={isView}
        viewText={workLog?.remarks}
        emptyLabel="ไม่มีหมายเหตุ"
        value={formData?.remarks}
        placeholder="ผลการทำงาน ความคืบหน้า หรือสิ่งที่ต้องติดตาม…"
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
    setProjectWorkItems([])
    fetchCollection<WorkLogWorkItem>(
      `/api/work-items?projectId=${encodeURIComponent(projectId)}&year=all`,
      "workItems",
    )
      .then((workItems) => {
        if (!cancelled) setProjectWorkItems(workItems)
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

/** Lazy form body; the caller keeps the dialog surface mounted while this chunk loads. */
export function WorkLogDialogBody({
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

  let dialogTitle = "เพิ่มบันทึกงาน"
  if (isViewMode) dialogTitle = "รายละเอียดบันทึกงาน"
  else if (isEditMode) dialogTitle = "แก้ไขบันทึกงาน"

  const selectedWorkItem = isViewMode
    ? workLog?.workItem
    : projectWorkItems.find((item) => item.id === formData?.workItemId)

  return (
    <>
      {isViewMode && workLog?.project ? (
        <div className="shrink-0">
          <ProjectIdentity name={workLog.project.name} color={workLog.project.colorProject} size="sm" className="pr-12" />
        </div>
      ) : (
        <DialogHeader className="shrink-0 gap-1 px-4 pt-4 pr-12 text-left data-[slot=dialog-header]:pb-3 sm:px-6 sm:pr-12">
          <DialogTitle className="text-xl leading-snug">{dialogTitle}</DialogTitle>
          <DialogDescription>
            {isViewMode
              ? "รายละเอียดและเวลาที่บันทึก"
              : "ระบุเวลาและเชื่อมโยงงานใน Project"}
          </DialogDescription>
        </DialogHeader>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 sm:px-6">
        <div className="flex min-h-full min-w-0 flex-col gap-4">
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
                    <span className="text-xs text-muted-foreground">{formatUiDate(workLog.date)}</span>
                    <Badge variant="outline" className="max-w-full items-start gap-1 whitespace-normal">
                      <Clock className="mt-0.5 h-3 w-3 shrink-0" />
                      <span className="content-wrap min-w-0 tabular-nums">{formatHours(workLog.hours)} ชม.</span>
                    </Badge>
                  </div>
                  <DialogDescription className="sr-only">รายละเอียดบันทึกงาน</DialogDescription>
                </div>
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
            <div className="grid flex-1 gap-5 md:grid-cols-[minmax(16rem,1fr)_minmax(0,2fr)]">
              <div className="grid min-w-0 content-start grid-cols-2 gap-3 md:gap-4">
                <div className="col-span-2 grid grid-cols-[minmax(0,1fr)_5.5rem] gap-3">
                  <div className="min-w-0 space-y-1.5">
                    <Label htmlFor="date">วันที่ <span className="text-danger">*</span></Label>
                    <DatePicker
                      id="date"
                      required
                      value={formData?.date || ""}
                      onValueChange={(date) => onFormDataChange?.({ ...formData!, date })}
                      disabled={isLoading}
                    />
                  </div>
                  <div className="min-w-0 space-y-1.5">
                    <Label htmlFor="hours">ชั่วโมง <span className="text-danger">*</span></Label>
                    <Input
                      id="hours"
                      type="number"
                      min="0.01"
                      step="0.01"
                      value={formData?.hours || ""}
                      onChange={(event) => onFormDataChange?.({ ...formData!, hours: event.target.value })}
                      disabled={isLoading}
                    />
                  </div>
                </div>

                <div className="col-span-2 min-w-0 space-y-1.5">
                  <Label htmlFor="work-log-project">Project <span className="text-danger">*</span></Label>
                  <SearchSelect
                    id="work-log-project"
                    value={formData?.projectId || ""}
                    options={projectOptions}
                    onSelect={handleProjectSelect}
                    placeholder="เลือก Project…"
                    searchPlaceholder="ค้นหา Project…"
                    emptyText="ไม่พบ Project"
                    disabled={isLoading}
                  />
                </div>

                <div className="col-span-2 min-w-0 space-y-1.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <Label htmlFor="work-log-work-item">งาน <span className="text-danger">*</span></Label>
                    {selectedWorkItem && (
                      <Badge variant="outline" className={kindClass(selectedWorkItem.kind as WorkItemKindValue)}>
                        {selectedWorkItem.kind}
                      </Badge>
                    )}
                  </div>
                  <SearchSelect
                    id="work-log-work-item"
                    value={formData?.workItemId || ""}
                    options={workItemOptions}
                    onSelect={handleWorkItemSelect}
                    placeholder={loadingWorkItems ? "กำลังโหลดงาน…" : "เลือกงาน…"}
                    searchPlaceholder="ค้นหางาน…"
                    emptyText="ไม่พบงานใน Project นี้"
                    disabled={isLoading || !formData?.projectId || loadingWorkItems}
                    disabledHint="เลือก Project ก่อน"
                  />
                </div>

                <div className="col-span-2 min-w-0 space-y-1.5">
                  <Label htmlFor="status">สถานะ <span className="text-danger">*</span></Label>
                  <Select
                    value={formData?.status || ""}
                    onValueChange={(value) => onFormDataChange?.({ ...formData!, status: value })}
                    disabled={isLoading}
                  >
                    <SelectTrigger id="status" className="w-full">
                      <SelectValue placeholder="เลือกสถานะ" />
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
      </div>

      <DialogFooter className="shrink-0 flex-row flex-wrap justify-end gap-2 border-t border-border/60 px-4 py-3 data-[slot=dialog-footer]:pt-3 max-sm:[&>button]:flex-1 sm:px-6">
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
    </>
  )
}

export function WorkLogDialog(props: Readonly<WorkLogDialogProps>) {
  if (props.mode === 'view' && !props.workLog) return null
  return <Dialog open={props.open} onOpenChange={props.onOpenChange}>
    <DialogContent className={DIALOG_SHELL_WIDE_CLASS}>
      <WorkLogDialogBody {...props} />
    </DialogContent>
  </Dialog>
}
