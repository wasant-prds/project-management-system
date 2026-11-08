import { NextResponse } from 'next/server'
import { projects as projectStore } from '@/lib/database/repositories/projects'
import { companies } from '@/lib/database/repositories/companies'
import { getOwner, ownerErrorResponse } from '@/lib/owner'
import {
  apiError,
  companyRelationConflict,
  parseProjectInput,
  parsePage,
  nextPage,
  optionalPublicId,
  PROJECT_STATUSES,
} from '@/lib/project-management'
import { serializeProject, serializeProjectOption } from '@/lib/project-query'
import { parsePublicId } from '@/lib/public-id'

export async function GET(request: Request) {
  try {
    const owner = await getOwner()
    const params = new URL(request.url).searchParams
    const status = params.get('status')
    if (status !== null && !PROJECT_STATUSES.includes(status as (typeof PROJECT_STATUSES)[number])) {
      return apiError(400, 'VALIDATION_ERROR', 'Invalid status', 'status')
    }
    if (params.get('options') === 'work-items') {
      const projects = await projectStore.options()
      return NextResponse.json({ projects: projects.map(serializeProjectOption) })
    }
    const companyRef = optionalPublicId(params.get('companyId'), 'companyId')
    if ('error' in companyRef) return apiError(400, 'VALIDATION_ERROR', companyRef.error, companyRef.field)
    const company = companyRef.publicId ? await companies.byPublicId(companyRef.publicId) : null
    if (companyRef.publicId && !company) return apiError(404, 'NOT_FOUND', 'ไม่พบ Company', 'companyId')
    const search = params.get('search')
    const filterKey = JSON.stringify({ status, companyId: companyRef.publicId, search })
    const pagination = parsePage(params, filterKey, owner.id)
    if (pagination.error) return apiError(400, 'VALIDATION_ERROR', pagination.error, 'cursor')
    const projects = await projectStore.list({
      status,
      companyId: company?.id,
      search,
      limit: pagination.limit! + 1,
      cursor: pagination.cursor,
    })
    const result = nextPage(projects, pagination.limit!, filterKey, owner.id)
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
    const companyPublicId = parsePublicId(data.companyId)
    if (!companyPublicId) return apiError(400, 'VALIDATION_ERROR', 'ต้องเป็น public UUID', 'companyId')
    const company = await companies.byPublicId(companyPublicId)
    if (!company) return apiError(400, 'VALIDATION_ERROR', 'Company does not exist', 'companyId')
    const project = await projectStore.create({
      name: data.name as string,
      description: data.description as string | null | undefined,
      status: data.status as string | undefined,
      priority: data.priority as string | undefined,
      startDate: data.startDate as Date,
      dueDate: data.dueDate as Date,
      colorProject: data.colorProject as string | null | undefined,
      companyId: company.id,
      creatorId: owner.internalId,
    })
    return NextResponse.json({ project: serializeProject(project!) }, { status: 201 })
  } catch (error) {
    const ownerError = ownerErrorResponse(error)
    if (ownerError) return ownerError
    const companyConflict = companyRelationConflict(error)
    if (companyConflict) return companyConflict
    if (error instanceof SyntaxError) return apiError(400, 'VALIDATION_ERROR', 'JSON ไม่ถูกต้อง')
    return apiError(500, 'INTERNAL_ERROR', 'ไม่สามารถสร้าง Project ได้')
  }
}
