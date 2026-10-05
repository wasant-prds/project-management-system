import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getOwner, ownerErrorResponse } from '@/lib/owner'
import { serializeWorkItemStatus } from '@/lib/work-items'
import { apiError, calendarDate, bangkokTimestamp, companyRelationConflict, parseProjectInput, projectSummary } from '@/lib/project-management'
import { projectListInclude, serializeProject } from '@/lib/project-query'
import { parsePublicId } from '@/lib/public-id'

const contextParams = async (context: { params: Promise<{ id: string }> }) => (await context.params).id

function readPublicProjectId(value: string) {
  return parsePublicId(value)
}

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const owner = await getOwner()
    const publicId = readPublicProjectId(await contextParams(context))
    if (!publicId) return apiError(400, 'VALIDATION_ERROR', 'ต้องเป็น public UUID', 'id')
    const project = await prisma.project.findUnique({
      where: { publicId },
      include: {
        company: { select: { publicId: true, name: true, displayName: true } },
        workItems: {
          where: { assigneeId: owner.internalId },
          include: { assignee: { select: { publicId: true, name: true, avatar: true } } },
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        },
        timeEntries: {
          where: { userId: owner.internalId },
          select: { publicId: true, hours: true, date: true, workItem: { select: { publicId: true } } },
        },
      },
    })
    if (!project) return apiError(404, 'NOT_FOUND', 'ไม่พบ Project')
    const summary = projectSummary(project.workItems, project.timeEntries)
    return NextResponse.json({ project: {
      id: project.publicId,
      name: project.name,
      description: project.description,
      status: project.status,
      priority: project.priority,
      startDate: calendarDate(project.startDate),
      dueDate: calendarDate(project.dueDate),
      budget: project.budget ? project.budget.toString() : null,
      spent: project.spent ? project.spent.toString() : null,
      colorProject: project.colorProject,
      createdAt: bangkokTimestamp(project.createdAt),
      updatedAt: bangkokTimestamp(project.updatedAt),
      companyId: project.company.publicId,
      company: {
        id: project.company.publicId,
        name: project.company.name,
        displayName: project.company.displayName,
      },
      workItems: project.workItems.map((item) => ({
        id: item.publicId,
        title: item.title,
        description: item.description,
        kind: item.kind,
        priority: item.priority,
        role: item.role,
        status: serializeWorkItemStatus(item.status),
        types: item.types,
        workDate: item.workDate ? calendarDate(item.workDate) : null,
        dueDate: item.dueDate ? calendarDate(item.dueDate) : null,
        submittedAt: item.submittedAt ? bangkokTimestamp(item.submittedAt) : null,
        createdAt: bangkokTimestamp(item.createdAt),
        updatedAt: bangkokTimestamp(item.updatedAt),
        projectId: project.publicId,
        assignee: { id: item.assignee.publicId, name: item.assignee.name, avatar: item.assignee.avatar },
      })),
      timeEntries: project.timeEntries.map((entry) => ({
        id: entry.publicId,
        date: calendarDate(entry.date),
        hours: entry.hours.toString(),
        workItemId: entry.workItem?.publicId ?? null,
      })),
      summary,
      progress: summary.progress,
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
    const publicId = readPublicProjectId(await contextParams(context))
    if (!publicId) return apiError(400, 'VALIDATION_ERROR', 'ต้องเป็น public UUID', 'id')
    const parsed = parseProjectInput(await request.json(), true)
    if (parsed.error) return apiError(400, 'VALIDATION_ERROR', parsed.error, parsed.field)
    const existing = await prisma.project.findUnique({
      where: { publicId },
      select: { id: true, startDate: true, dueDate: true, companyId: true },
    })
    if (!existing) return apiError(404, 'NOT_FOUND', 'ไม่พบ Project')
    const data = parsed.data!
    if (existing.companyId === null && !data.companyId) {
      return apiError(409, 'COMPANY_CONFLICT', 'Project ยังไม่ผูก Company', 'companyId')
    }
    let companyId = existing.companyId
    if (data.companyId) {
      const companyPublicId = parsePublicId(data.companyId)
      if (!companyPublicId) return apiError(400, 'VALIDATION_ERROR', 'ต้องเป็น public UUID', 'companyId')
      const company = await prisma.company.findUnique({ where: { publicId: companyPublicId }, select: { id: true } })
      if (!company) return apiError(400, 'VALIDATION_ERROR', 'Company does not exist', 'companyId')
      companyId = company.id
    }
    const startDate = (data.startDate as Date | undefined) ?? existing.startDate
    const dueDate = (data.dueDate as Date | undefined) ?? existing.dueDate
    if (startDate > dueDate) return apiError(400, 'VALIDATION_ERROR', 'Due date precedes start date', 'dueDate')
    const project = await prisma.project.update({
      where: { id: existing.id },
      data: {
        ...(typeof data.name === 'string' ? { name: data.name } : {}),
        ...(data.description !== undefined ? { description: data.description as string | null } : {}),
        ...(data.status !== undefined ? { status: data.status as string } : {}),
        ...(data.priority !== undefined ? { priority: data.priority as string } : {}),
        ...(data.startDate instanceof Date ? { startDate: data.startDate } : {}),
        ...(data.dueDate instanceof Date ? { dueDate: data.dueDate } : {}),
        ...(data.colorProject !== undefined ? { colorProject: data.colorProject as string | null } : {}),
        companyId,
      },
      include: projectListInclude,
    })
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
    const publicId = readPublicProjectId(await contextParams(context))
    if (!publicId) return apiError(400, 'VALIDATION_ERROR', 'ต้องเป็น public UUID', 'id')
    const existing = await prisma.project.findUnique({
      where: { publicId },
      select: {
        id: true,
        _count: { select: { workItems: true, timeEntries: true, documents: true, milestones: true, activityLogs: true, members: true } },
      },
    })
    if (!existing) return apiError(404, 'NOT_FOUND', 'ไม่พบ Project')
    if (Object.values(existing._count).some((count) => count > 0)) {
      return apiError(409, 'HISTORY_CONFLICT', 'Project มีข้อมูลอ้างอิง ให้เก็บสถานะ On Hold แทน')
    }
    await prisma.project.delete({ where: { id: existing.id } })
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
