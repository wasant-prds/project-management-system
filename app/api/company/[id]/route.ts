import { NextResponse } from 'next/server'
import { companies } from '@/lib/database/repositories/companies'
import { getOwner, ownerErrorResponse } from '@/lib/owner'
import { apiError } from '@/lib/project-management'
import { DHAS_COMPANY, parseCompanyInput, serializeCompany } from '@/lib/company'
import { parsePublicId } from '@/lib/public-id'

type Context = { params: Promise<{ id: string }> }

function failure(error: unknown, message: string) {
  const ownerError = ownerErrorResponse(error)
  if (ownerError) return ownerError
  if (error instanceof SyntaxError) return apiError(400, 'VALIDATION_ERROR', 'JSON ไม่ถูกต้อง')
  if (typeof error === 'object' && error !== null && 'code' in error && error.code === '23503') {
    return apiError(409, 'HISTORY_CONFLICT', 'Company มี Projects อ้างอิงอยู่')
  }
  return apiError(500, 'INTERNAL_ERROR', message)
}

function readCompanyId(value: string) {
  const publicId = parsePublicId(value)
  if (!publicId) return null
  return publicId
}

export async function PATCH(request: Request, context: Context) {
  try {
    await getOwner()
    const publicId = readCompanyId((await context.params).id)
    if (!publicId) return apiError(400, 'VALIDATION_ERROR', 'ต้องเป็น public UUID', 'id')
    const parsed = parseCompanyInput(await request.json(), true)
    if (parsed.error) return apiError(400, 'VALIDATION_ERROR', parsed.error, parsed.field)
    const existing = await companies.byPublicId(publicId)
    if (!existing) return apiError(404, 'NOT_FOUND', 'ไม่พบ Company')
    if (existing.code === 'dhas' && parsed.data?.name && parsed.data.name !== DHAS_COMPANY.name) {
      return apiError(409, 'CONFLICT', 'ชื่อ Dhas Company เปลี่ยนไม่ได้', 'name')
    }
    if (existing.code !== 'dhas' && parsed.data?.name === DHAS_COMPANY.name) {
      return apiError(409, 'CONFLICT', 'ชื่อ Dhas Company สงวนไว้', 'name')
    }
    const company = await companies.update(existing.id, parsed.data!)
    return NextResponse.json({ company: serializeCompany(company!) })
  } catch (error) {
    return failure(error, 'ไม่สามารถแก้ Company ได้')
  }
}

export async function DELETE(_request: Request, context: Context) {
  try {
    await getOwner()
    const publicId = readCompanyId((await context.params).id)
    if (!publicId) return apiError(400, 'VALIDATION_ERROR', 'ต้องเป็น public UUID', 'id')
    const company = await companies.byPublicId(publicId)
    if (!company) return apiError(404, 'NOT_FOUND', 'ไม่พบ Company')
    if (company.code === 'dhas' || (await companies.projectCount(company.id)) > 0)
      return apiError(409, 'HISTORY_CONFLICT', 'Company นี้มีประวัติหรือเป็น Dhas หลัก')
    await companies.remove(company.id)
    return NextResponse.json({ message: 'ลบ Company แล้ว' })
  } catch (error) {
    return failure(error, 'ไม่สามารถลบ Company ได้')
  }
}
