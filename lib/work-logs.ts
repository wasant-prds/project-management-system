import { prisma } from '@/lib/db'
import { serializeWorkItemStatus } from '@/lib/work-items'
import { serializeBangkokTimestamp } from '@/lib/bangkok-datetime'
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

export async function resolveWorkItemId(
  projectId: string | null | undefined,
  workItemId: unknown,
  ownerId: string,
  database: Pick<Prisma.TransactionClient, 'workItem'> = prisma,
) {
  if (workItemId === undefined) return undefined
  if (typeof workItemId !== 'string' || workItemId.trim() === '') {
    throw new Error('A work item is required before saving Daily Work')
  }

  if (!projectId) {
    throw new Error('A project is required before assigning a work item')
  }

  const workItem = await database.workItem.findFirst({
    where: { id: workItemId, projectId, assigneeId: ownerId },
    select: { id: true },
  })
  if (!workItem) {
    throw new Error('Work item does not belong to the selected project')
  }
  return workItem.id
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
    createdAt?: Date
    updatedAt?: Date
    workItem: { id: string; title: string; kind: string; status: WorkItemStatus; assigneeId: string } | null
  },
>(workLog: T, ownerId: string) {
  return {
    ...workLog,
    date: serializeBangkokTimestamp(workLog.date),
    ...(workLog.createdAt ? { createdAt: serializeBangkokTimestamp(workLog.createdAt) } : {}),
    ...(workLog.updatedAt ? { updatedAt: serializeBangkokTimestamp(workLog.updatedAt) } : {}),
    workItem: serializeOwnedWorkItem(workLog.workItem, ownerId),
  }
}

