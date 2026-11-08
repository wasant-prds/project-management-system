import { NextResponse } from 'next/server'
import { companies as companyStore } from '@/lib/database/repositories/companies'
import { getOwner, ownerErrorResponse } from '@/lib/owner'
import { apiError, parsePage, nextPage } from '@/lib/project-management'
import {
  CompanyConflictError,
  DHAS_COMPANY,
  getOrCreateDhasCompany,
  parseCompanyInput,
  serializeCompany,
} from '@/lib/company'

function failure(error: unknown, message: string) {
  const ownerError = ownerErrorResponse(error)
  if (ownerError) return ownerError
  if (error instanceof CompanyConflictError) return apiError(409, 'CONFLICT', error.message)
  if (error instanceof SyntaxError) return apiError(400, 'VALIDATION_ERROR', 'JSON ไม่ถูกต้อง')
  return apiError(500, 'INTERNAL_ERROR', message)
}

export async function GET(request: Request) {
  try {
    const owner = await getOwner()
    await getOrCreateDhasCompany()
    const params = new URL(request.url).searchParams
    const search = params.get('search')?.trim() ?? ''
    const filterKey = JSON.stringify({ search })
    const pagination = parsePage(params, filterKey, owner.id)
    if (pagination.error) return apiError(400, 'VALIDATION_ERROR', pagination.error, 'cursor')
    const companies = await companyStore.list(search, pagination.limit! + 1, pagination.cursor)
    const page = nextPage(companies, pagination.limit!, filterKey, owner.id)
    const companyIds = page.items.map((company) => company.id)
    const summaries = companyIds.length ? await companyStore.summaries(companyIds) : []
    const summaryByCompany = new Map(summaries.map((summary) => [summary.companyId.toString(), summary]))
    return NextResponse.json({
      companies: page.items.map((profile) => {
        const summary = summaryByCompany.get(profile.id.toString())
        return {
          ...serializeCompany(profile),
          summary: {
            projects: summary?.projectCount ?? 0,
            workItems: summary?.workItemCount ?? 0,
            hours: summary?.hours ?? '0',
          },
        }
      }),
      page: page.page,
    })
  } catch (error) {
    return failure(error, 'ไม่สามารถอ่าน Companies ได้')
  }
}

export async function POST(request: Request) {
  try {
    await getOwner()
    const parsed = parseCompanyInput(await request.json())
    if (parsed.error) return apiError(400, 'VALIDATION_ERROR', parsed.error, parsed.field)
    if (parsed.data?.name === DHAS_COMPANY.name)
      return apiError(409, 'CONFLICT', 'Dhas Company มีอยู่แล้ว', 'name')
    const company = await companyStore.create(parsed.data!)
    return NextResponse.json({ company: serializeCompany(company!) }, { status: 201 })
  } catch (error) {
    return failure(error, 'ไม่สามารถสร้าง Company ได้')
  }
}
