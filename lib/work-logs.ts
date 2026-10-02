import { prisma } from '@/lib/db'
import { serializeWorkItemStatus } from '@/lib/work-items'
import { serializeBangkokCalendarDate, serializeBangkokTimestamp } from '@/lib/bangkok-datetime'
import type { Prisma, WorkItemStatus } from '@prisma/client'

export const workLogInclude = {
  user: {
    select: {
      id: true,
      name: true,
      email: true,
      avatar: true,
    },
  },
  project: {
    select: {
      id: true,
      name: true,
      colorProject: true,
    },
  },
  workItem: {
    select: {
      id: true,
      title: true,
      kind: true,
      status: true,
      assigneeId: true,
    },
  },
} as const

export async function resolveOwnedWorkItem(
  workItemId: unknown,
  ownerId: string,
  database: Pick<Prisma.TransactionClient, 'workItem'> = prisma,
) {
  if (typeof workItemId !== 'string' || workItemId.trim() === '') {
    return null
  }

  const workItem = await database.workItem.findFirst({
    where: { id: workItemId.trim(), assigneeId: ownerId },
    select: { id: true, projectId: true },
  })
  return workItem
}

function serializeOwnedWorkItem(
  workItem: { id: string; title: string; kind: string; status: WorkItemStatus; assigneeId: string } | null,
  ownerId: string,
) {
  if (workItem?.assigneeId !== ownerId) return null
  return {
    id: workItem.id,
    title: workItem.title,
    kind: workItem.kind,
    status: serializeWorkItemStatus(workItem.status),
  }
}

export function serializeWorkLog<
  T extends {
    date: Date
    hours: { toString(): string }
    createdAt?: Date
    updatedAt?: Date
    workItem: { id: string; title: string; kind: string; status: WorkItemStatus; assigneeId: string } | null
  },
>(workLog: T, ownerId: string) {
  return {
    ...workLog,
    hours: workLog.hours.toString(),
    date: serializeBangkokCalendarDate(workLog.date),
    ...(workLog.createdAt ? { createdAt: serializeBangkokTimestamp(workLog.createdAt) } : {}),
    ...(workLog.updatedAt ? { updatedAt: serializeBangkokTimestamp(workLog.updatedAt) } : {}),
    workItem: serializeOwnedWorkItem(workLog.workItem, ownerId),
  }
}

