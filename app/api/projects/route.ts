import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getOwner, ownerErrorResponse } from '@/lib/owner'
import { apiError, companyRelationConflict, parseProjectInput, parsePage, nextPage } from '@/lib/project-management'
import { projectListInclude, serializeProject } from '@/lib/project-query'

export async function GET(request: Request) {
  try {
    await getOwner()
    const params = new URL(request.url).searchParams
    if (params.get('options') === 'work-items') {
      const projects = await prisma.project.findMany({ select: { id: true, name: true, colorProject: true }, orderBy: { createdAt: 'desc' } })
      return NextResponse.json({ projects })
    }
    const status = params.get('status')
    const companyId = params.get('companyId')
    const search = params.get('search')
    const filterKey = JSON.stringify({ status, companyId, search })
    const pagination = parsePage(params, filterKey)
    if (pagination.error) return apiError(400, 'VALIDATION_ERROR', pagination.error, 'cursor')
    const projects = await prisma.project.findMany({
      where: {
        ...(status ? { status } : {}),
        ...(companyId ? { companyId } : {}),
        ...(search ? { name: { contains: search, mode: 'insensitive' as const } } : {}),
      },
      include: projectListInclude,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: pagination.limit! + 1,
      ...(pagination.cursor ? { cursor: { id: pagination.cursor }, skip: 1 } : {}),
    })
    const result = nextPage(projects, pagination.limit!, filterKey)
    return NextResponse.json({ projects: result.items.map(serializeProject), page: result.page })
  } catch (error) {
    const ownerError = ownerErrorResponse(error)
    if (ownerError) return ownerError
    return apiError(500, 'INTERNAL_ERROR', 'ไม่สามารถอ่าน Projects ได้')
  }
}

export async function POST(request: Request) {
  try {
    const owner = await getOwner()
    const parsed = parseProjectInput(await request.json())
    if (parsed.error) return apiError(400, 'VALIDATION_ERROR', parsed.error, parsed.field)
    const data = parsed.data!
    const company = await prisma.company.findUnique({ where: { id: data.companyId as string }, select: { id: true } })
    if (!company) return apiError(400, 'VALIDATION_ERROR', 'Company does not exist', 'companyId')
    const project = await prisma.project.create({
      data: { ...data, creatorId: owner.id } as import('@prisma/client').Prisma.ProjectUncheckedCreateInput,
      include: projectListInclude,
    })
    return NextResponse.json({ project: serializeProject(project) }, { status: 201 })
  } catch (error) {
    const ownerError = ownerErrorResponse(error)
    if (ownerError) return ownerError
    const companyConflict = companyRelationConflict(error)
    if (companyConflict) return companyConflict
    if (error instanceof SyntaxError) return apiError(400, 'VALIDATION_ERROR', 'JSON ไม่ถูกต้อง')
    return apiError(500, 'INTERNAL_ERROR', 'ไม่สามารถสร้าง Project ได้')
  }
}
