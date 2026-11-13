'use client'

import { useEffect, useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { DatePicker } from '@/components/ui/lazy-date-picker'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { toast } from '@/hooks/use-toast'
import { Loader2 } from 'lucide-react'
import { WORK_ITEM_DIALOG_SHELL_CLASS } from './work-item-dialog-shell'
import {
  WORK_ITEM_KINDS,
  WORK_ITEM_PRIORITIES,
  WORK_ITEM_PRIORITY_LABELS,
  WORK_ITEM_ROLES,
  WORK_ITEM_ROLE_LABELS,
  workItemTypeLabel,
  WORK_ITEM_STATUSES,
  WORK_ITEM_STATUS_LABELS,
  WORK_ITEM_TYPES,
  type WorkItemKindValue,
  type WorkItemPriorityValue,
  type WorkItemRoleValue,
  type WorkItemStatusValue,
} from '@/lib/work-items'

type ProjectOption = { id: string; name: string }

export type WorkItemFormValues = {
  id?: string
  title: string
  description: string
  kind: WorkItemKindValue
  priority: WorkItemPriorityValue
  role: WorkItemRoleValue | ''
  status: WorkItemStatusValue
  types: string[]
  workDate: string
  dueDate: string
  projectId: string
}

export const emptyWorkItemForm = (): WorkItemFormValues => ({
  title: '',
  description: '',
  kind: 'Task',
  priority: 'none',
  role: '',
  status: 'backlog',
  types: [],
  workDate: '',
  dueDate: '',
  projectId: '',
})

type WorkItemDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  mode: 'create' | 'edit'
  initialValues: WorkItemFormValues
  projects: ProjectOption[]
  onSaved: () => void
}

export function WorkItemDialog({
  open,
  onOpenChange,
  mode,
  initialValues,
  projects,
  onSaved,
}: Readonly<WorkItemDialogProps>) {
  const [form, setForm] = useState<WorkItemFormValues>(initialValues)
  const [isLoading, setIsLoading] = useState(false)

  useEffect(() => {
    if (open) {
      setForm(initialValues)
    }
  }, [open, initialValues])

  const toggleType = (type: string) => {
    setForm((current) => ({
      ...current,
      types: current.types.includes(type)
        ? current.types.filter((item) => item !== type)
        : [...current.types, type],
    }))
  }

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!form.title.trim() || !form.projectId) {
      toast({
        title: 'กรุณาตรวจข้อมูล',
        description: 'ระบุชื่องานและ Project ก่อนบันทึก',
        variant: 'destructive',
      })
      return
    }

    setIsLoading(true)
    try {
      const payload = {
        title: form.title.trim(),
        description: form.description.trim() || null,
        kind: form.kind,
        priority: form.priority,
        role: form.role || null,
        status: form.status,
        types: form.types,
        workDate: form.workDate || null,
        dueDate: form.dueDate || null,
        projectId: form.projectId,
      }

      const url = mode === 'edit' && form.id ? `/api/work-items/${form.id}` : '/api/work-items'
      const method = mode === 'edit' ? 'PATCH' : 'POST'
      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await response.json()
      if (!response.ok) {
        const message = typeof data.error === 'string' ? data.error : data.error?.message
        throw new Error(message || 'บันทึก Work Item ไม่สำเร็จ')
      }

      toast({
        title: 'บันทึกแล้ว',
        description: mode === 'edit' ? 'แก้ไข Work Item แล้ว' : 'สร้าง Work Item แล้ว',
      })
      onOpenChange(false)
      onSaved()
    } catch (error) {
      toast({
        title: 'บันทึกไม่สำเร็จ',
        description: error instanceof Error ? error.message : 'บันทึก Work Item ไม่สำเร็จ',
        variant: 'destructive',
      })
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={WORK_ITEM_DIALOG_SHELL_CLASS}>
        <form className="flex h-full min-h-0 flex-1 flex-col overflow-hidden" onSubmit={handleSubmit}>
          <DialogHeader className="shrink-0 space-y-1 px-4 pt-5 pr-12 sm:px-6">
            <DialogTitle>{mode === 'edit' ? 'แก้ไข Work Item' : 'สร้าง Work Item'}</DialogTitle>
            <DialogDescription>
              Incident, Issue หรือ Task ใน Project โดยเจ้าของระบบเป็นผู้รับผิดชอบ
            </DialogDescription>
          </DialogHeader>

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 sm:px-6">
            <div className="grid gap-4 sm:grid-cols-2">
            <h2 className="type-label sm:col-span-2">รายละเอียดงาน</h2>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="title">ชื่องาน <span className="text-danger">*</span></Label>
              <Input
                id="title"
                value={form.title}
                onChange={(event) => setForm({ ...form, title: event.target.value })}
                placeholder="ระบุชื่องาน"
                disabled={isLoading}
              />
            </div>

            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="description">รายละเอียด</Label>
              <Textarea
                id="description"
                value={form.description}
                onChange={(event) => setForm({ ...form, description: event.target.value })}
                placeholder="เพิ่มรายละเอียด รองรับ Markdown เช่น หัวข้อ รายการ **ตัวหนา** และ `code`"
                className="min-h-[120px] whitespace-pre-wrap sm:min-h-[160px]"
                disabled={isLoading}
              />
            </div>

            <h2 className="type-label border-t border-border/60 pt-3 sm:col-span-2">การจัดหมวดหมู่</h2>
            <div className="space-y-2">
              <Label htmlFor="work-item-kind">ชนิดงาน <span className="text-danger">*</span></Label>
              <Select
                value={form.kind}
                onValueChange={(value) => setForm({ ...form, kind: value as WorkItemKindValue })}
                disabled={isLoading}
              >
                <SelectTrigger id="work-item-kind">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {WORK_ITEM_KINDS.map((kind) => (
                    <SelectItem key={kind} value={kind}>{kind}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="work-item-project">Project <span className="text-danger">*</span></Label>
              <Select
                value={form.projectId}
                onValueChange={(value) => setForm({ ...form, projectId: value })}
                disabled={isLoading}
              >
                <SelectTrigger id="work-item-project">
                  <SelectValue placeholder="เลือก Project" />
                </SelectTrigger>
                <SelectContent>
                  {projects.map((project) => (
                    <SelectItem key={project.id} value={project.id}>{project.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="work-item-priority">ความสำคัญ</Label>
              <Select
                value={form.priority}
                onValueChange={(value) => setForm({ ...form, priority: value as WorkItemPriorityValue })}
                disabled={isLoading}
              >
                <SelectTrigger id="work-item-priority">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {WORK_ITEM_PRIORITIES.map((priority) => (
                    <SelectItem key={priority} value={priority}>
                      {WORK_ITEM_PRIORITY_LABELS[priority]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="work-item-role">บทบาท</Label>
              <Select
                value={form.role || 'none'}
                onValueChange={(value) => setForm({ ...form, role: value === 'none' ? '' : value as WorkItemRoleValue })}
                disabled={isLoading}
              >
                <SelectTrigger id="work-item-role">
                  <SelectValue placeholder="เลือกบทบาท" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">ไม่ระบุบทบาท</SelectItem>
                  {WORK_ITEM_ROLES.map((role) => (
                    <SelectItem key={role} value={role}>
                      {WORK_ITEM_ROLE_LABELS[role]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="work-item-status">สถานะ</Label>
              <Select
                value={form.status}
                onValueChange={(value) => setForm({ ...form, status: value as WorkItemStatusValue })}
                disabled={isLoading}
              >
                <SelectTrigger id="work-item-status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {WORK_ITEM_STATUSES.map((status) => (
                    <SelectItem key={status} value={status}>
                      {WORK_ITEM_STATUS_LABELS[status]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <p className="self-center text-xs text-muted-foreground">ผู้รับผิดชอบ: เจ้าของระบบ</p>
            <h2 className="type-label border-t border-border/60 pt-3 sm:col-span-2">กำหนดการ</h2>
            <div className="space-y-2">
              <Label htmlFor="workDate">วันที่ทำงาน</Label>
              <DatePicker
                id="workDate"
                clearable
                value={form.workDate}
                onValueChange={(workDate) => setForm({ ...form, workDate })}
                disabled={isLoading}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="dueDate">กำหนดส่ง</Label>
              <DatePicker
                id="dueDate"
                clearable
                value={form.dueDate}
                onValueChange={(dueDate) => setForm({ ...form, dueDate })}
                disabled={isLoading}
              />
            </div>

            <div className="space-y-2 sm:col-span-2">
              <Label id="work-item-types-label">ประเภทงาน</Label>
              <div role="group" aria-labelledby="work-item-types-label" className="flex flex-wrap gap-2">
                {[...new Set([...WORK_ITEM_TYPES, ...initialValues.types, ...form.types])].map((type) => {
                  const selected = form.types.includes(type)
                  return (
                    <Button
                      key={type}
                      type="button"
                      size="sm"
                      variant={selected ? 'default' : 'outline'}
                      aria-pressed={selected}
                      onClick={() => toggleType(type)}
                      disabled={isLoading}
                    >
                      {workItemTypeLabel(type)}
                    </Button>
                  )
                })}
              </div>
            </div>
            </div>
          </div>

          <DialogFooter className="shrink-0 flex-row justify-end border-t border-border/60 px-4 py-3 sm:px-6 sm:py-4">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isLoading}>
              ยกเลิก
            </Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {mode === 'edit' ? 'บันทึกการแก้ไข' : 'สร้าง Work Item'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
