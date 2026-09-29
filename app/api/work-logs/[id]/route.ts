import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { serializeWorkLog, workLogInclude, resolveWorkItemId } from '@/lib/work-logs'
import { getOwner, ownerErrorResponse } from '@/lib/owner'

function parseHours(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (typeof value !== 'string' || value.trim() === '') return null

  const hours = Number(value)
  return Number.isFinite(hours) ? hours : null
}

function parseDate(value: unknown): Date | null {
  if (typeof value !== 'string' || value.trim() === '') return null

  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

async function workLogUpdateData(body: Record<string, unknown>, currentProjectId: string | null) {
  const { description, remarks, hours, date, projectId, workItemId, status } = body
  const updateData: Record<string, unknown> = {}
  if (description !== undefined) updateData.description = description
  if (remarks !== undefined) updateData.remarks = remarks
  if (hours !== undefined) {
    const parsedHours = parseHours(hours)
    if (parsedHours === null) return { error: 'hours must be a finite number' }
    updateData.hours = parsedHours
  }
  if (date !== undefined) {
    const parsedDate = parseDate(date)
    if (parsedDate === null) return { error: 'date must be a valid date string' }
    updateData.date = parsedDate
  }
  if (projectId !== undefined) updateData.projectId = projectId
  if (status !== undefined) updateData.status = status
  if (workItemId !== undefined) {
    let nextProjectId = currentProjectId
    if (projectId !== undefined) nextProjectId = projectId as string | null
    updateData.workItemId = await resolveWorkItemId(nextProjectId, workItemId)
  }
  return { data: updateData }
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const owner = await getOwner()
    const { id } = await params
    const workLog = await prisma.timeEntry.findFirst({
      where: { id, userId: owner.id },
      include: workLogInclude,
    })

    if (!workLog) {
      return NextResponse.json({ error: 'Work log not found' }, { status: 404 })
    }

    return NextResponse.json({ workLog: serializeWorkLog(workLog) }, { status: 200 })
  } catch (error) {
    const ownerError = ownerErrorResponse(error)
    if (ownerError) return ownerError
    console.error('Error fetching work log:')
    return NextResponse.json({ error: 'Failed to fetch work log' }, { status: 500 })
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const owner = await getOwner()
    const { id } = await params
    const body = await request.json()
    if (body.userId !== undefined && body.userId !== owner.id) {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: 'userId ต้องเป็นเจ้าของระบบ' } },
        { status: 400 },
      )
    }
    const existing = await prisma.timeEntry.findFirst({
      where: { id, userId: owner.id },
      select: { projectId: true },
    })
    if (!existing) {
      return NextResponse.json({ error: 'Work log not found' }, { status: 404 })
    }

    const update = await workLogUpdateData(body, existing.projectId)
    if ('error' in update) {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: update.error } },
        { status: 400 },
      )
    }

    const workLog = await prisma.timeEntry.update({
      where: { id },
      data: update.data,
      include: workLogInclude,
    })

    return NextResponse.json({ workLog: serializeWorkLog(workLog) }, { status: 200 })
  } catch (error) {
    const ownerError = ownerErrorResponse(error)
    if (ownerError) return ownerError
    const message = error instanceof Error ? error.message : 'Failed to update work log'
    console.error('Error updating work log:')
    const status = ['Work item does not belong to the selected project', 'A project is required before assigning a work item'].includes(message) ? 400 : 500
    return NextResponse.json({ error: status === 400 ? message : 'Failed to save Daily Work' }, { status })
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const owner = await getOwner()
    const { id } = await params
    const result = await prisma.timeEntry.deleteMany({ where: { id, userId: owner.id } })
    if (!result.count) {
      return NextResponse.json({ error: 'Work log not found' }, { status: 404 })
    }
    return NextResponse.json({ message: 'Work log deleted successfully' }, { status: 200 })
  } catch (error) {
    const ownerError = ownerErrorResponse(error)
    if (ownerError) return ownerError
    console.error('Error deleting work log:')
    return NextResponse.json({ error: 'Failed to delete work log' }, { status: 500 })
  }
}
