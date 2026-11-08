import { database, type Database } from '@/lib/database/client'
import { workItems } from '@/lib/database/repositories/work-items'
import { serializeWorkItemStatus } from '@/lib/work-items'
import { serializeBangkokCalendarDate, serializeBangkokTimestamp } from '@/lib/bangkok-datetime'
import type { WorkItemStatus } from '@/lib/database/types'
import { parsePublicId } from '@/lib/public-id'

export async function resolveOwnedWorkItem(
  workItemId: unknown,
  ownerInternalId: bigint,
  connection: Database = database,
) {
  const publicId = parsePublicId(typeof workItemId === 'string' ? workItemId.trim() : '')
  if (!publicId) return null

  return workItems.byPublicId(publicId, ownerInternalId, connection)
}

function serializeOwnedWorkItem(
  workItem: {
    publicId: string
    title: string
    kind: string
    status: WorkItemStatus
    assigneeId: bigint
  } | null,
  ownerInternalId: bigint,
) {
  if (!workItem || workItem.assigneeId !== ownerInternalId) return null
  return {
    id: workItem.publicId,
    title: workItem.title,
    kind: workItem.kind,
    status: serializeWorkItemStatus(workItem.status),
  }
}

export function serializeWorkLog<
  T extends {
    publicId: string
    description: string | null
    remarks: string | null
    date: Date
    hours: { toString(): string }
    status: string | null
    createdAt?: Date
    updatedAt?: Date
    user: { publicId: string; name: string; email: string; avatar: string | null }
    project: { publicId: string; name: string; colorProject: string | null } | null
    workItem: {
      publicId: string
      title: string
      kind: string
      status: WorkItemStatus
      assigneeId: bigint
    } | null
  },
>(workLog: T, ownerInternalId: bigint) {
  return {
    id: workLog.publicId,
    description: workLog.description,
    remarks: workLog.remarks,
    hours: workLog.hours.toString(),
    date: serializeBangkokCalendarDate(workLog.date),
    status: workLog.status,
    ...(workLog.createdAt ? { createdAt: serializeBangkokTimestamp(workLog.createdAt) } : {}),
    ...(workLog.updatedAt ? { updatedAt: serializeBangkokTimestamp(workLog.updatedAt) } : {}),
    user: {
      id: workLog.user.publicId,
      name: workLog.user.name,
      email: workLog.user.email,
      avatar: workLog.user.avatar,
    },
    project: workLog.project
      ? {
          id: workLog.project.publicId,
          name: workLog.project.name,
          colorProject: workLog.project.colorProject,
        }
      : null,
    workItem: serializeOwnedWorkItem(workLog.workItem, ownerInternalId),
  }
}
