import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getOwner, ownerErrorResponse } from '@/lib/owner'
import { serializeWorkItemStatus } from '@/lib/work-items'
import { apiError, calendarDate, bangkokTimestamp, companyRelationConflict, parseProjectInput, projectSummary } from '@/lib/project-management'
import { projectListInclude, serializeProject } from '@/lib/project-query'

const contextParams = async (context: { params: Promise<{ id: string }> }) => (await context.params).id

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    await getOwner()
    const id = await contextParams(context)
    const project = await prisma.project.findUnique({
      where: { id },
      include: {
        company: { select: { id: true, name: true, displayName: true } },
        workItems: { include: { assignee: { select: { name: true, avatar: true } } }, orderBy: { createdAt: 'desc' } },
        timeEntries: { select: { id: true, hours: true, date: true, workItemId: true } },
      },
    })
    if (!project) return apiError(404, 'NOT_FOUND', 'ไม่พบ Project')
    const summary = projectSummary(project.workItems, project.timeEntries)
    return NextResponse.json({ project: {
      ...project,
      startDate: calendarDate(project.startDate), dueDate: calendarDate(project.dueDate),
      createdAt: bangkokTimestamp(project.createdAt), updatedAt: bangkokTimestamp(project.updatedAt),
      workItems: project.workItems.map((item) => ({
        ...item, status: serializeWorkItemStatus(item.status),
        workDate: item.workDate ? calendarDate(item.workDate) : null,
        dueDate: item.dueDate ? calendarDate(item.dueDate) : null,
        submittedAt: item.submittedAt ? bangkokTimestamp(item.submittedAt) : null,
        createdAt: bangkokTimestamp(item.createdAt), updatedAt: bangkokTimestamp(item.updatedAt),
      })),
      timeEntries: project.timeEntries.map((entry) => ({ ...entry, date: calendarDate(entry.date), hours: entry.hours.toString() })),
      summary, progress: summary.progress,
    } })
  } catch (error) {
    const ownerError = ownerErrorResponse(error)
    if (ownerError) return ownerError
    return apiError(500, 'INTERNAL_ERROR', 'ไม่สามารถอ่าน Project ได้')
  }
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    await getOwner()
    const id = await contextParams(context)
    const parsed = parseProjectInput(await request.json(), true)
    if (parsed.error) return apiError(400, 'VALIDATION_ERROR', parsed.error, parsed.field)
    const existing = await prisma.project.findUnique({ where: { id }, select: { id: true, startDate: true, dueDate: true, companyId: true } })
    if (!existing) return apiError(404, 'NOT_FOUND', 'ไม่พบ Project')
    const data = parsed.data!
    if (!existing.companyId && !data.companyId) return apiError(409, 'COMPANY_MAPPING_REQUIRED', 'Project เดิมต้องผูก Company ก่อนแก้ไข', 'companyId')
    if (data.companyId) {
      const company = await prisma.company.findUnique({ where: { id: data.companyId as string }, select: { id: true } })
      if (!company) return apiError(400, 'VALIDATION_ERROR', 'Company does not exist', 'companyId')
    }
    const startDate = (data.startDate as Date | undefined) ?? existing.startDate
    const dueDate = (data.dueDate as Date | undefined) ?? existing.dueDate
    if (startDate > dueDate) return apiError(400, 'VALIDATION_ERROR', 'Due date precedes start date', 'dueDate')
    const project = await prisma.project.update({ where: { id }, data, include: projectListInclude })
    return NextResponse.json({ project: serializeProject(project) })
  } catch (error) {
    const ownerError = ownerErrorResponse(error)
    if (ownerError) return ownerError
    const companyConflict = companyRelationConflict(error)
    if (companyConflict) return companyConflict
    if (error instanceof SyntaxError) return apiError(400, 'VALIDATION_ERROR', 'JSON ไม่ถูกต้อง')
    return apiError(500, 'INTERNAL_ERROR', 'ไม่สามารถแก้ Project ได้')
  }
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    await getOwner()
    const id = await contextParams(context)
    const existing = await prisma.project.findUnique({ where: { id }, select: {
      _count: { select: { workItems: true, timeEntries: true, documents: true, milestones: true, activityLogs: true, members: true } },
    } })
    if (!existing) return apiError(404, 'NOT_FOUND', 'ไม่พบ Project')
    if (Object.values(existing._count).some((count) => count > 0)) {
      return apiError(409, 'HISTORY_CONFLICT', 'Project มีข้อมูลอ้างอิง ให้เก็บสถานะ On Hold แทน')
    }
    await prisma.project.delete({ where: { id } })
    return NextResponse.json({ message: 'ลบ Project แล้ว' })
  } catch (error) {
    const ownerError = ownerErrorResponse(error)
    if (ownerError) return ownerError
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2003') {
      return apiError(409, 'HISTORY_CONFLICT', 'Project มีข้อมูลอ้างอิง จึงลบไม่ได้')
    }
    return apiError(500, 'INTERNAL_ERROR', 'ไม่สามารถลบ Project ได้')
  }
}
