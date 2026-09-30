import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getOwner, ownerErrorResponse } from '@/lib/owner'
import { apiError, serializeTimestamps } from '@/lib/project-management'
import { DHAS_COMPANY, parseCompanyInput } from '@/lib/company'

type Context = { params: Promise<{ id: string }> }

function failure(error: unknown, message: string) {
  const ownerError = ownerErrorResponse(error)
  if (ownerError) return ownerError
  if (error instanceof SyntaxError) return apiError(400, 'VALIDATION_ERROR', 'JSON ไม่ถูกต้อง')
  if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2003') {
    return apiError(409, 'HISTORY_CONFLICT', 'Company มี Projects อ้างอิงอยู่')
  }
  return apiError(500, 'INTERNAL_ERROR', message)
}

export async function PATCH(request: Request, context: Context) {
  try {
    await getOwner()
    const id = (await context.params).id
    const parsed = parseCompanyInput(await request.json(), true)
    if (parsed.error) return apiError(400, 'VALIDATION_ERROR', parsed.error, parsed.field)
    const existing = await prisma.company.findUnique({ where: { id }, select: { id: true, code: true } })
    if (!existing) return apiError(404, 'NOT_FOUND', 'ไม่พบ Company')
    if (existing.code === 'dhas' && parsed.data?.name && parsed.data.name !== DHAS_COMPANY.name) {
      return apiError(409, 'CONFLICT', 'ชื่อ Dhas Company เปลี่ยนไม่ได้', 'name')
    }
    if (existing.code !== 'dhas' && parsed.data?.name === DHAS_COMPANY.name) {
      return apiError(409, 'CONFLICT', 'ชื่อ Dhas Company สงวนไว้', 'name')
    }
    const company = await prisma.company.update({ where: { id }, data: parsed.data as import('@prisma/client').Prisma.CompanyUpdateInput })
    return NextResponse.json({ company: serializeTimestamps(company) })
  } catch (error) { return failure(error, 'ไม่สามารถแก้ Company ได้') }
}

export async function DELETE(_request: Request, context: Context) {
  try {
    await getOwner()
    const id = (await context.params).id
    const company = await prisma.company.findUnique({ where: { id }, select: { code: true, _count: { select: { projects: true } } } })
    if (!company) return apiError(404, 'NOT_FOUND', 'ไม่พบ Company')
    if (company.code === 'dhas' || company._count.projects > 0) return apiError(409, 'HISTORY_CONFLICT', 'Company นี้มีประวัติหรือเป็น Dhas หลัก')
    await prisma.company.delete({ where: { id } })
    return NextResponse.json({ message: 'ลบ Company แล้ว' })
  } catch (error) { return failure(error, 'ไม่สามารถลบ Company ได้') }
}
