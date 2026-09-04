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
  DEFAULT_ASSIGNEE_ID,
  WORK_ITEM_KINDS,
  WORK_ITEM_PRIORITIES,
  WORK_ITEM_PRIORITY_LABELS,
  WORK_ITEM_ROLES,
  WORK_ITEM_ROLE_LABELS,
  WORK_ITEM_STATUSES,
  WORK_ITEM_STATUS_LABELS,
  WORK_ITEM_TYPES,
  type WorkItemKindValue,
  type WorkItemPriorityValue,
  type WorkItemRoleValue,
  type WorkItemStatusValue,
  type WorkItemTypeValue,
} from '@/lib/work-items'

type ProjectOption = { id: string; name: string }
type UserOption = { id: string; name: string }

export type WorkItemFormValues = {
  id?: string
  title: string
  description: string
  kind: WorkItemKindValue
  priority: WorkItemPriorityValue
  role: WorkItemRoleValue | ''
  status: WorkItemStatusValue
  types: WorkItemTypeValue[]
  workDate: string
  dueDate: string
  projectId: string
  assigneeId: string
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
  assigneeId: DEFAULT_ASSIGNEE_ID,
})

type WorkItemDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  mode: 'create' | 'edit'
  initialValues: WorkItemFormValues
  projects: ProjectOption[]
  users: UserOption[]
  onSaved: () => void
}

export function WorkItemDialog({
  open,
  onOpenChange,
  mode,
  initialValues,
  projects,
  users,
  onSaved,
}: Readonly<WorkItemDialogProps>) {
  const [form, setForm] = useState<WorkItemFormValues>(initialValues)
  const [isLoading, setIsLoading] = useState(false)

  useEffect(() => {
    if (open) {
      setForm(initialValues)
    }
  }, [open, initialValues])

  const toggleType = (type: WorkItemTypeValue) => {
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
        title: 'Validation Error',
        description: 'Title and project are required',
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
        assigneeId: form.assigneeId || DEFAULT_ASSIGNEE_ID,
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
        throw new Error(data.error || 'Failed to save work item')
      }

      toast({
        title: 'Success',
        description: mode === 'edit' ? 'Work item updated' : 'Work item created',
      })
      onOpenChange(false)
      onSaved()
    } catch (error) {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to save work item',
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
            <DialogTitle>{mode === 'edit' ? 'Edit Work Item' : 'New Work Item'}</DialogTitle>
            <DialogDescription>
              Incident, Issue, or Task in a project. Assignee defaults to Wasant Pep.
            </DialogDescription>
          </DialogHeader>

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 sm:px-6">
            <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="title">Title <span className="text-destructive">*</span></Label>
              <Input
                id="title"
                value={form.title}
                onChange={(event) => setForm({ ...form, title: event.target.value })}
                placeholder="Work item title"
                disabled={isLoading}
              />
            </div>

            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={form.description}
                onChange={(event) => setForm({ ...form, description: event.target.value })}
                placeholder="Optional details. Markdown is supported (headings, lists, **bold**, `code`)."
                className="min-h-[120px] whitespace-pre-wrap sm:min-h-[160px]"
                disabled={isLoading}
              />
            </div>

            <div className="space-y-2">
              <Label>Kind <span className="text-destructive">*</span></Label>
              <Select
                value={form.kind}
                onValueChange={(value) => setForm({ ...form, kind: value as WorkItemKindValue })}
                disabled={isLoading}
              >
                <SelectTrigger>
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
              <Label>Project <span className="text-destructive">*</span></Label>
              <Select
                value={form.projectId}
                onValueChange={(value) => setForm({ ...form, projectId: value })}
                disabled={isLoading}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select project" />
                </SelectTrigger>
                <SelectContent>
                  {projects.map((project) => (
                    <SelectItem key={project.id} value={project.id}>{project.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Assignee</Label>
              <Select
                value={form.assigneeId}
                onValueChange={(value) => setForm({ ...form, assigneeId: value })}
                disabled={isLoading}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select assignee" />
                </SelectTrigger>
                <SelectContent>
                  {users.map((user) => (
                    <SelectItem key={user.id} value={user.id}>{user.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Priority</Label>
              <Select
                value={form.priority}
                onValueChange={(value) => setForm({ ...form, priority: value as WorkItemPriorityValue })}
                disabled={isLoading}
              >
                <SelectTrigger>
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
              <Label>Role</Label>
              <Select
                value={form.role || 'none'}
                onValueChange={(value) => setForm({ ...form, role: value === 'none' ? '' : value as WorkItemRoleValue })}
                disabled={isLoading}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select role" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Not set</SelectItem>
                  {WORK_ITEM_ROLES.map((role) => (
                    <SelectItem key={role} value={role}>
                      {WORK_ITEM_ROLE_LABELS[role]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Status</Label>
              <Select
                value={form.status}
                onValueChange={(value) => setForm({ ...form, status: value as WorkItemStatusValue })}
                disabled={isLoading}
              >
                <SelectTrigger>
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

            <div className="space-y-2">
              <Label htmlFor="workDate">Work date</Label>
              <Input
                id="workDate"
                type="date"
                value={form.workDate}
                onChange={(event) => setForm({ ...form, workDate: event.target.value })}
                disabled={isLoading}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="dueDate">Due date</Label>
              <Input
                id="dueDate"
                type="date"
                value={form.dueDate}
                onChange={(event) => setForm({ ...form, dueDate: event.target.value })}
                disabled={isLoading}
              />
            </div>

            <div className="space-y-2 sm:col-span-2">
              <Label>Types</Label>
              <div className="flex flex-wrap gap-2">
                {WORK_ITEM_TYPES.map((type) => {
                  const selected = form.types.includes(type)
                  return (
                    <Button
                      key={type}
                      type="button"
                      size="sm"
                      variant={selected ? 'default' : 'outline'}
                      onClick={() => toggleType(type)}
                      disabled={isLoading}
                    >
                      {type}
                    </Button>
                  )
                })}
              </div>
            </div>
            </div>
          </div>

          <DialogFooter className="shrink-0 flex-row justify-end border-t border-border/60 px-4 py-3 sm:px-6 sm:py-4">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isLoading}>
              Cancel
            </Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {mode === 'edit' ? 'Save changes' : 'Create'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
