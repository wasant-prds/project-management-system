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
  project: WorkItemProject
  assignee: { id: string; name: string; avatar: string | null }
}

export type ProjectOption = {
  id: string
  name: string
  colorProject?: string | null
}
