import type { WorkItemStatus } from '@prisma/client'
import { serializeWorkItemStatus } from '@/lib/work-items'
import { serializeBangkokCalendarDate, serializeBangkokTimestamp } from '@/lib/bangkok-datetime'

export const workItemInclude = {
  assignee: {
    select: { id: true, name: true, email: true, avatar: true },
  },
  project: {
    select: {
      id: true,
      name: true,
      colorProject: true,
      company: { select: { id: true, name: true, displayName: true } },
    },
  },
  externalReference: {
    select: { externalUrl: true, gitLabIssueIid: true },
  },
} as const

export function workItemDetailInclude(ownerId: string) {
  return {
    ...workItemInclude,
    timeEntries: {
      where: { userId: ownerId },
      select: { id: true, date: true, hours: true, description: true, remarks: true },
      orderBy: [{ date: 'desc' as const }, { id: 'desc' as const }],
    },
  }
}

type WorkItemResponseRecord = {
  status: WorkItemStatus
  workDate: Date | null
  dueDate: Date | null
  submittedAt: Date | null
  createdAt: Date
  updatedAt: Date
  externalReference?: { externalUrl: string; gitLabIssueIid: string } | null
  timeEntries?: Array<{
    id: string
    date: Date
    hours: { toString(): string }
    description: string | null
    remarks: string | null
  }>
}

export function serializeWorkItem<T extends WorkItemResponseRecord>(item: T) {
  const timeEntries = item.timeEntries?.map((entry) => ({
    ...entry,
    date: serializeBangkokCalendarDate(entry.date),
    hours: entry.hours.toString(),
  }))

  return {
    ...item,
    status: serializeWorkItemStatus(item.status),
    workDate: item.workDate ? serializeBangkokCalendarDate(item.workDate) : null,
    dueDate: item.dueDate ? serializeBangkokCalendarDate(item.dueDate) : null,
    submittedAt: item.submittedAt ? serializeBangkokTimestamp(item.submittedAt) : null,
    createdAt: serializeBangkokTimestamp(item.createdAt),
    updatedAt: serializeBangkokTimestamp(item.updatedAt),
    source: item.externalReference ? {
      provider: 'gitlab',
      url: item.externalReference.externalUrl,
      issueIid: item.externalReference.gitLabIssueIid,
    } : null,
    ...(timeEntries ? { timeEntries } : {}),
  }
}
