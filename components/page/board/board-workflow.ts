import type { WorkItem } from '@/components/page/work-items/types'
import {
  WORK_ITEM_STATUSES,
  type WorkItemStatusValue,
} from '@/lib/work-items'
import { parseBangkokDateTime, serializeBangkokCalendarDate } from '@/lib/bangkok-datetime'

export type BoardFilters = {
  companyId: string
  projectId: string
  role: string
}

export type BoardStatusGroups = Record<WorkItemStatusValue, WorkItem[]>
export type BoardFetch = (url: string, init?: RequestInit) => Promise<{
  ok: boolean
  json: () => Promise<unknown>
}>
export type BoardItemsSetter = (update: (current: WorkItem[]) => WorkItem[]) => void

export function canApplyBoardLoad(signal: { aborted: boolean }, pendingWriteCount: number) {
  return !signal.aborted && pendingWriteCount === 0
}

export function getSelectedBoardWorkItem(workItems: WorkItem[], workItemId: string | null) {
  if (!workItemId) return null
  return workItems.find((workItem) => workItem.id === workItemId) ?? null
}

type BoardResponse = {
  [key: string]: unknown
  page?: { nextCursor?: unknown }
}

function apiErrorMessage(payload: unknown, fallback: string) {
  if (typeof payload !== 'object' || payload === null || !('error' in payload)) return fallback
  const error = payload.error
  if (typeof error !== 'object' || error === null || !('message' in error)) return fallback
  return typeof error.message === 'string' ? error.message : fallback
}

async function readPayload(response: Awaited<ReturnType<BoardFetch>>, fallback: string) {
  let payload: unknown
  try {
    payload = await response.json()
  } catch {
    payload = null
  }
  if (!response.ok) throw new Error(apiErrorMessage(payload, fallback))
  if (typeof payload !== 'object' || payload === null) throw new Error(fallback)
  return payload as BoardResponse
}

export async function fetchPagedCollection<T>(
  request: BoardFetch,
  path: string,
  collectionName: string,
  parameters: Record<string, string> = {},
): Promise<T[]> {
  const items: T[] = []
  const seenCursors = new Set<string>()
  let cursor: string | null = null

  while (true) {
    const query = new URLSearchParams({ limit: '200', ...parameters })
    if (cursor) query.set('cursor', cursor)
    const response = await request(`${path}?${query.toString()}`)
    const payload = await readPayload(response, 'ไม่สามารถโหลดข้อมูลจากระบบได้')
    const pageItems = payload[collectionName]
    if (!Array.isArray(pageItems) || !payload.page || !('nextCursor' in payload.page)) {
      throw new Error('รูปแบบข้อมูลที่ได้รับไม่ถูกต้อง')
    }
    items.push(...pageItems as T[])

    const nextCursor = payload.page.nextCursor
    if (nextCursor === null) return items
    if (typeof nextCursor !== 'string' || nextCursor.length === 0 || seenCursors.has(nextCursor)) {
      throw new Error('ตัวชี้หน้าถัดไปไม่ถูกต้อง')
    }
    seenCursors.add(nextCursor)
    cursor = nextCursor
  }
}

export function boardWorkItemParameters(filters: BoardFilters) {
  return {
    year: 'all',
    month: 'all',
    ...(filters.companyId !== 'all' ? { companyId: filters.companyId } : {}),
    ...(filters.projectId !== 'all' ? { projectId: filters.projectId } : {}),
    ...(filters.role !== 'all' ? { role: filters.role } : {}),
  }
}

export function fetchBoardWorkItems(request: BoardFetch, filters: BoardFilters) {
  return fetchPagedCollection<WorkItem>(
    request,
    '/api/work-items',
    'workItems',
    boardWorkItemParameters(filters),
  )
}

export function groupBoardWorkItems(workItems: WorkItem[]): BoardStatusGroups {
  const groups = {} as BoardStatusGroups
  for (const status of WORK_ITEM_STATUSES) groups[status] = []
  const seenWorkItemIds = new Set<string>()

  for (const workItem of workItems) {
    if (seenWorkItemIds.has(workItem.id) || !WORK_ITEM_STATUSES.includes(workItem.status)) continue
    groups[workItem.status].push(workItem)
    seenWorkItemIds.add(workItem.id)
  }

  return groups
}

export function formatBoardCalendarDate(value: string | null | undefined) {
  if (!value) return '—'
  const date = parseBangkokDateTime(value)
  return date ? serializeBangkokCalendarDate(date) : '—'
}

function replaceWorkItemStatus(
  workItems: WorkItem[],
  workItemId: string,
  status: WorkItemStatusValue,
) {
  return workItems.map((workItem) => (
    workItem.id === workItemId ? { ...workItem, status } : workItem
  ))
}

export async function patchBoardWorkItemStatus(
  request: BoardFetch,
  workItemId: string,
  status: WorkItemStatusValue,
): Promise<WorkItemStatusValue> {
  const response = await request(`/api/work-items/${encodeURIComponent(workItemId)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status }),
  })
  const payload = await readPayload(response, 'ไม่สามารถบันทึกสถานะ Work Item ได้')
  const workItem = payload.workItem
  if (typeof workItem !== 'object' || workItem === null || !('id' in workItem) || !('status' in workItem)) {
    throw new Error('ข้อมูลสถานะที่บันทึกไม่ถูกต้อง')
  }
  if (workItem.id !== workItemId || workItem.status !== status) {
    throw new Error('สถานะที่บันทึกไม่ตรงกับ Work Item')
  }
  return status
}

export async function transitionBoardWorkItemStatus(
  currentItems: WorkItem[],
  workItemId: string,
  nextStatus: WorkItemStatusValue,
  persist: () => Promise<WorkItemStatusValue>,
  setItems: BoardItemsSetter,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const currentItem = currentItems.find((workItem) => workItem.id === workItemId)
  if (!currentItem) return { ok: false, message: 'ไม่พบ Work Item บน Board' }
  if (!WORK_ITEM_STATUSES.includes(nextStatus)) return { ok: false, message: 'สถานะ Work Item ไม่ถูกต้อง' }
  if (currentItem.status === nextStatus) return { ok: true }

  setItems((items) => replaceWorkItemStatus(items, workItemId, nextStatus))
  try {
    const savedStatus = await persist()
    if (savedStatus !== nextStatus) throw new Error('สถานะที่บันทึกไม่ตรงกับ Work Item')
    setItems((items) => replaceWorkItemStatus(items, workItemId, savedStatus))
    return { ok: true }
  } catch (error) {
    setItems((items) => replaceWorkItemStatus(items, workItemId, currentItem.status))
    return {
      ok: false,
      message: error instanceof Error ? error.message : 'ไม่สามารถบันทึกสถานะ Work Item ได้',
    }
  }
}
