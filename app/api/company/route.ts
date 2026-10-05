import { NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db'
import { getOwner, ownerErrorResponse } from '@/lib/owner'
import { apiError, parsePage, nextPage } from '@/lib/project-management'
import { CompanyConflictError, DHAS_COMPANY, getOrCreateDhasCompany, parseCompanyInput, serializeCompany } from '@/lib/company'

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
    const companies = await prisma.company.findMany({
      where: search ? { OR: [
        { name: { contains: search, mode: 'insensitive' } },
        { displayName: { contains: search, mode: 'insensitive' } },
      ] } : undefined,
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
      take: pagination.limit! + 1,
      ...(pagination.cursor ? { cursor: { id: pagination.cursor }, skip: 1 } : {}),
    })
    const page = nextPage(companies, pagination.limit!, filterKey, owner.id)
    const companyIds = page.items.map((company) => company.id)
    const summaries = companyIds.length ? await prisma.$queryRaw<Array<{
      companyId: bigint
      projectCount: number
      workItemCount: number
      hours: string
    }>>`
      WITH project_metrics AS (
        SELECT p."company_id", p.id,
          COUNT(w.id)::integer AS work_item_count,
          COALESCE(t.hours, 0) AS hours
        FROM "projects" p
        LEFT JOIN "work_items" w ON w."project_id" = p.id
        LEFT JOIN (
          SELECT te."project_id", SUM(te.hours) AS hours
          FROM "work_logs" te
          WHERE te."project_id" IN (
            SELECT id FROM "projects" WHERE "company_id" IN (${Prisma.join(companyIds)})
          )
          GROUP BY te."project_id"
        ) t ON t."project_id" = p.id
        WHERE p."company_id" IN (${Prisma.join(companyIds)})
        GROUP BY p."company_id", p.id, t.hours
      )
      SELECT "company_id" AS "companyId", COUNT(*)::integer AS "projectCount",
        COALESCE(SUM(work_item_count), 0)::integer AS "workItemCount",
        COALESCE(SUM(hours), 0)::text AS hours
      FROM project_metrics
      GROUP BY "company_id"
    ` : []
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
  } catch (error) { return failure(error, 'ไม่สามารถอ่าน Companies ได้') }
}

export async function POST(request: Request) {
  try {
    await getOwner()
    const parsed = parseCompanyInput(await request.json())
    if (parsed.error) return apiError(400, 'VALIDATION_ERROR', parsed.error, parsed.field)
    if (parsed.data?.name === DHAS_COMPANY.name) return apiError(409, 'CONFLICT', 'Dhas Company มีอยู่แล้ว', 'name')
    const company = await prisma.company.create({ data: parsed.data as { name: string } })
    return NextResponse.json({ company: serializeCompany(company) }, { status: 201 })
  } catch (error) { return failure(error, 'ไม่สามารถสร้าง Company ได้') }
}
