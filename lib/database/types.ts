// Application result types only. DDL, defaults, constraints and indexes live in database/schema.sql.
export type WorkItemKind = 'Incident' | 'Issue' | 'Task'
export type WorkItemPriority = 'none' | 'low' | 'medium' | 'high' | 'urgent'
export type WorkItemRole = 'Developer' | 'infra' | 'SA'
export type WorkItemStatus =
  | 'backlog'
  | 'todo'
  | 'in-progress'
  | 'blocked'
  | 'sa-testing'
  | 'pm-testing'
  | 'completed'
  | 'cancelled'
export type UserTheme = 'light' | 'dark' | 'special-dark'
export type UserLocale = 'th' | 'en'
export type RowIdentity = { id: bigint; publicId: string; createdAt: Date; updatedAt: Date }
export type User = RowIdentity & {
  email: string
  name: string
  role: string
  avatar: string | null
  phone: string | null
  status: string
  theme: UserTheme
  locale: UserLocale
}
export type Company = RowIdentity & {
  code: string | null
  displayName: string | null
  location: string | null
  name: string
  industry: string | null
  email: string | null
  phone: string | null
  address: string | null
  website: string | null
  logo: string | null
  description: string | null
}
export type Project = RowIdentity & {
  name: string
  description: string | null
  status: string
  priority: string
  startDate: Date
  dueDate: Date
  budget: string | null
  spent: string | null
  progress: number
  colorProject: string | null
  creatorId: bigint | null
  companyId: bigint
}
export type WorkItem = RowIdentity & {
  title: string
  description: string | null
  kind: WorkItemKind
  priority: WorkItemPriority
  role: WorkItemRole | null
  status: WorkItemStatus
  types: string[]
  workDate: Date | null
  dueDate: Date | null
  submittedAt: Date | null
  projectId: bigint
  assigneeId: bigint
}
export type WorkLog = RowIdentity & {
  description: string | null
  remarks: string | null
  date: Date
  hours: string
  status: string | null
  userId: bigint
  projectId: bigint | null
  workItemId: bigint | null
}
export type SourceMapping = RowIdentity & {
  provider: string
  instanceUrl: string
  externalProjectId: string
  projectId: bigint
  approvedLabelMap: Record<string, unknown>
  firstSyncApprovedAt: Date | null
}
export type ExternalWorkItemReference = RowIdentity & {
  provider: string
  instanceUrl: string
  externalProjectId: string
  externalIssueId: string
  externalIssueNumber: string
  externalUrl: string
  projectId: bigint
  remoteCreatedAt: Date
  remoteUpdatedAt: Date
  lastSyncedAt: Date
  inScope: boolean
  workItemId: bigint
}
export type IssueSyncConfig = RowIdentity & {
  mappingId: bigint
  sourceProjectPath: string
  assignees: string[]
  tokenEnvVar: string | null
  enabled: boolean
  revision: number
  leaseUntil: Date | null
  leaseToken: string | null
}
export type IssueSyncRun = RowIdentity & {
  configId: bigint
  status: string
  configSnapshot: Record<string, unknown>
  createdCount: number
  updatedCount: number
  skippedCount: number
  failedCount: number
  results: unknown[]
  runError: unknown
  finishedAt: Date | null
}
export type Party = { publicId: string; name: string; email: string; avatar: string | null }
export type ProjectParty = {
  publicId: string
  name: string
  colorProject: string | null
  company: { publicId: string; name: string; displayName: string | null }
}
export type WorkItemView = WorkItem & {
  assignee: Party
  project: ProjectParty
  externalReference: Pick<
    ExternalWorkItemReference,
    'provider' | 'externalUrl' | 'externalIssueNumber' | 'inScope'
  > | null
  timeEntries?: Array<Pick<WorkLog, 'publicId' | 'date' | 'hours' | 'description' | 'remarks'>>
}
export type WorkLogView = WorkLog & {
  user: Party
  project: Pick<ProjectParty, 'publicId' | 'name' | 'colorProject'> | null
  workItem: Pick<WorkItem, 'publicId' | 'title' | 'kind' | 'status' | 'assigneeId'> | null
}
export type ProjectView = Project & {
  company: Pick<Company, 'publicId' | 'name' | 'displayName'>
  workItems: Array<Pick<WorkItem, 'status' | 'role'>>
  timeEntries: Array<{ hours: string }>
}
