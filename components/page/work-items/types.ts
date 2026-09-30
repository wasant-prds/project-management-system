import type {
  WorkItemKindValue,
  WorkItemPriorityValue,
  WorkItemRoleValue,
  WorkItemStatusValue,
} from '@/lib/work-items'

export type WorkItemProject = {
  id: string
  name: string
  colorProject: string | null
  company?: { id: string; name: string; displayName: string | null } | null
}

export type WorkItemTimeEntry = {
  id: string
  date: string
  hours: string
  description: string | null
  remarks: string | null
}

export type WorkItem = {
  id: string
  title: string
  description: string | null
  kind: WorkItemKindValue
  priority: WorkItemPriorityValue
  role: WorkItemRoleValue | null
  status: WorkItemStatusValue
  types: string[]
  workDate: string | null
  dueDate: string | null
  submittedAt: string | null
  createdAt: string
  updatedAt?: string
  source?: { provider: 'gitlab'; url: string; issueIid: string } | null
  project: WorkItemProject
  assignee: { id: string; name: string; avatar: string | null }
  timeEntries?: WorkItemTimeEntry[]
}

export type ProjectOption = {
  id: string
  name: string
  colorProject?: string | null
}
