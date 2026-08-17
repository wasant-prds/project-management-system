import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { serializeWorkLog, workLogInclude, resolveWorkItemId } from '@/lib/work-logs'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const workLog = await prisma.timeEntry.findUnique({
      where: { id },
      include: workLogInclude,
    })

    if (!workLog) {
      return NextResponse.json({ error: 'Work log not found' }, { status: 404 })
    }

    return NextResponse.json({ workLog: serializeWorkLog(workLog) }, { status: 200 })
  } catch (error) {
    console.error('Error fetching work log:', error)
    return NextResponse.json({ error: 'Failed to fetch work log' }, { status: 500 })
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const body = await request.json()
    const { description, remarks, hours, date, projectId, workItemId, status } = body

    const existing = await prisma.timeEntry.findUnique({
      where: { id },
      select: { projectId: true },
    })
    if (!existing) {
      return NextResponse.json({ error: 'Work log not found' }, { status: 404 })
    }

    const nextProjectId = projectId === undefined ? existing.projectId : projectId
    const updateData: Record<string, unknown> = {}
    if (description !== undefined) updateData.description = description
    if (remarks !== undefined) updateData.remarks = remarks
    if (hours !== undefined) updateData.hours = Number.parseFloat(hours)
    if (date !== undefined) updateData.date = new Date(date)
    if (projectId !== undefined) updateData.projectId = projectId
    if (status !== undefined) updateData.status = status
    if (workItemId !== undefined) {
      updateData.workItemId = await resolveWorkItemId(nextProjectId, workItemId)
    }

    const workLog = await prisma.timeEntry.update({
      where: { id },
      data: updateData,
      include: workLogInclude,
    })

    return NextResponse.json({ workLog: serializeWorkLog(workLog) }, { status: 200 })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to update work log'
    console.error('Error updating work log:', error)
    const status = message.includes('Work item') || message.includes('project is required') ? 400 : 500
    return NextResponse.json({ error: message }, { status })
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    await prisma.timeEntry.delete({ where: { id } })
    return NextResponse.json({ message: 'Work log deleted successfully' }, { status: 200 })
  } catch (error) {
    console.error('Error deleting work log:', error)
    return NextResponse.json({ error: 'Failed to delete work log' }, { status: 500 })
  }
}
