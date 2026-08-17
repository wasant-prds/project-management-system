import { prisma } from '@/lib/db'
import { serializeWorkItemStatus } from '@/lib/work-items'
import type { WorkItemStatus } from '@prisma/client'

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
    },
  },
} as const

export async function resolveWorkItemId(projectId: string | null | undefined, workItemId: unknown) {
  if (workItemId === undefined) return undefined
  if (workItemId === null || workItemId === '') return null
  if (typeof workItemId !== 'string') return null

  if (!projectId) {
    throw new Error('A project is required before assigning a work item')
  }

  const workItem = await prisma.workItem.findUnique({
    where: { id: workItemId },
    select: { id: true, projectId: true },
  })
  if (workItem?.projectId !== projectId) {
    throw new Error('Work item does not belong to the selected project')
  }
  return workItem.id
}

export function serializeWorkLog<
  T extends { workItem: { status: WorkItemStatus } | null },
>(workLog: T) {
  return {
    ...workLog,
    workItem: workLog.workItem
      ? {
          ...workLog.workItem,
          status: serializeWorkItemStatus(workLog.workItem.status),
        }
      : null,
  }
}

