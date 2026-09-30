import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getOwner, ownerErrorResponse } from '@/lib/owner'
import { apiError, serializeTimestamps, projectSummary } from '@/lib/project-management'
import { CompanyConflictError, DHAS_COMPANY, getOrCreateDhasCompany, parseCompanyInput } from '@/lib/company'

function failure(error: unknown, message: string) {
  const ownerError = ownerErrorResponse(error)
  if (ownerError) return ownerError
  if (error instanceof CompanyConflictError) return apiError(409, 'CONFLICT', error.message)
  if (error instanceof SyntaxError) return apiError(400, 'VALIDATION_ERROR', 'JSON ไม่ถูกต้อง')
  return apiError(500, 'INTERNAL_ERROR', message)
}

export async function GET() {
  try {
    await getOwner()
    await getOrCreateDhasCompany()
    const companies = await prisma.company.findMany({
      include: { projects: { include: {
        workItems: { select: { status: true, role: true } },
        timeEntries: { select: { hours: true } },
      } } },
      orderBy: { name: 'asc' },
    })
    return NextResponse.json({ companies: companies.map(({ projects, ...profile }) => ({
      ...serializeTimestamps(profile),
      projects: projects.map((project) => ({
        id: project.id, name: project.name, summary: projectSummary(project.workItems, project.timeEntries),
      })),
    })) })
  } catch (error) { return failure(error, 'ไม่สามารถอ่าน Companies ได้') }
}

export async function POST(request: Request) {
  try {
    await getOwner()
    const parsed = parseCompanyInput(await request.json())
    if (parsed.error) return apiError(400, 'VALIDATION_ERROR', parsed.error, parsed.field)
    if (parsed.data?.name === DHAS_COMPANY.name) return apiError(409, 'CONFLICT', 'Dhas Company มีอยู่แล้ว', 'name')
    const company = await prisma.company.create({ data: parsed.data as { name: string } })
    return NextResponse.json({ company: serializeTimestamps(company) }, { status: 201 })
  } catch (error) { return failure(error, 'ไม่สามารถสร้าง Company ได้') }
}
