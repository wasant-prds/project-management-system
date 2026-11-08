import type { WorkItemStatus } from '@/lib/database/types'
import { serializeWorkItemStatus } from '@/lib/work-items'
import { serializeBangkokCalendarDate, serializeBangkokTimestamp } from '@/lib/bangkok-datetime'

type PublicParty = {
  publicId: string
  name: string
  email?: string
  avatar?: string | null
  displayName?: string | null
}

type WorkItemResponseRecord = {
  publicId: string
  title: string
  description: string | null
  kind: string
  priority: string
  role: string | null
  status: WorkItemStatus
  types: string[]
  workDate: Date | null
  dueDate: Date | null
  submittedAt: Date | null
  createdAt: Date
  updatedAt: Date
  assignee: { publicId: string; name: string; email: string; avatar: string | null }
  project: {
    publicId: string
    name: string
    colorProject: string | null
    company: { publicId: string; name: string; displayName: string | null }
  }
  externalReference?: {
    externalUrl: string
    externalIssueNumber: string
    provider: string
    inScope?: boolean
  } | null
  timeEntries?: Array<{
    publicId: string
    date: Date
    hours: { toString(): string }
    description: string | null
    remarks: string | null
  }>
}

function publicParty(party: PublicParty) {
  return {
    id: party.publicId,
    name: party.name,
    ...(party.email !== undefined ? { email: party.email } : {}),
    ...(party.avatar !== undefined ? { avatar: party.avatar } : {}),
    ...(party.displayName !== undefined ? { displayName: party.displayName } : {}),
  }
}

export function serializeWorkItem(item: WorkItemResponseRecord) {
  const source =
    item.externalReference && ['gitlab', 'github'].includes(item.externalReference.provider)
      ? item.externalReference
      : null
  return {
    id: item.publicId,
    title: item.title,
    description: item.description,
    kind: item.kind,
    priority: item.priority,
    role: item.role,
    status: serializeWorkItemStatus(item.status),
    types: item.types,
    workDate: item.workDate ? serializeBangkokCalendarDate(item.workDate) : null,
    dueDate: item.dueDate ? serializeBangkokCalendarDate(item.dueDate) : null,
    submittedAt: item.submittedAt ? serializeBangkokTimestamp(item.submittedAt) : null,
    createdAt: serializeBangkokTimestamp(item.createdAt),
    updatedAt: serializeBangkokTimestamp(item.updatedAt),
    projectId: item.project.publicId,
    assignee: publicParty(item.assignee),
    project: {
      id: item.project.publicId,
      name: item.project.name,
      colorProject: item.project.colorProject,
      company: {
        id: item.project.company.publicId,
        name: item.project.company.name,
        displayName: item.project.company.displayName,
      },
    },
    source: source
      ? {
          provider: source.provider,
          url: source.externalUrl,
          issueIid: source.externalIssueNumber,
          inScope: source.inScope ?? true,
        }
      : null,
    ...(item.timeEntries
      ? {
          timeEntries: item.timeEntries.map((entry) => ({
            id: entry.publicId,
            date: serializeBangkokCalendarDate(entry.date),
            hours: entry.hours.toString(),
            description: entry.description,
            remarks: entry.remarks,
          })),
        }
      : {}),
  }
}
