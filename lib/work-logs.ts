import { prisma } from '@/lib/db'
import { serializeWorkItemStatus } from '@/lib/work-items'
import { serializeBangkokCalendarDate, serializeBangkokTimestamp } from '@/lib/bangkok-datetime'
import type { Prisma, WorkItemStatus } from '@prisma/client'
import { parsePublicId } from '@/lib/public-id'

export const workLogInclude = {
  user: {
    select: {
      publicId: true,
      name: true,
      email: true,
      avatar: true,
    },
  },
  project: {
    select: {
      publicId: true,
      name: true,
      colorProject: true,
    },
  },
  workItem: {
    select: {
      publicId: true,
      title: true,
      kind: true,
      status: true,
      assigneeId: true,
    },
  },
} as const

export async function resolveOwnedWorkItem(
  workItemId: unknown,
  ownerInternalId: bigint,
  database: Pick<Prisma.TransactionClient, 'workItem'> = prisma,
) {
  const publicId = parsePublicId(typeof workItemId === 'string' ? workItemId.trim() : '')
  if (!publicId) return null

  return database.workItem.findFirst({
    where: { publicId, assigneeId: ownerInternalId },
    select: { id: true, publicId: true, projectId: true, project: { select: { publicId: true } } },
  })
}

function serializeOwnedWorkItem(
  workItem: { publicId: string; title: string; kind: string; status: WorkItemStatus; assigneeId: bigint } | null,
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
    workItem: { publicId: string; title: string; kind: string; status: WorkItemStatus; assigneeId: bigint } | null
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
    project: workLog.project ? {
      id: workLog.project.publicId,
      name: workLog.project.name,
      colorProject: workLog.project.colorProject,
    } : null,
    workItem: serializeOwnedWorkItem(workLog.workItem, ownerInternalId),
  }
}
