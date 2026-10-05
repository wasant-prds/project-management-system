import { NextResponse } from 'next/server'
import { getOwner, ownerErrorResponse } from '@/lib/owner'
import { getOwnerSettings, updateOwnerSettings } from '@/lib/settings'
import { parseOwnerSettingsPatch } from '@/lib/settings-input'

function apiError(status: number, code: string, message: string, field?: string) {
  return NextResponse.json({ error: { code, message, ...(field ? { field } : {}) } }, {
    status,
    headers: { 'Cache-Control': 'no-store' },
  })
}

function databaseErrorResponse(error: unknown) {
  if (typeof error !== 'object' || error === null || !('code' in error)) return null
  if (error.code === 'P2002') return apiError(409, 'CONFLICT', 'อีเมลนี้ถูกใช้แล้ว', 'email')
  if (error.code === 'P2025') return apiError(404, 'NOT_FOUND', 'ไม่พบข้อมูล owner settings')
  if (error.code === 'P1001' || error.code === 'P1002' || error.code === 'P1017') {
    return apiError(503, 'DEPENDENCY_UNAVAILABLE', 'ฐานข้อมูลยังไม่พร้อมใช้งาน')
  }
  return null
}

function handleUnexpectedError(error: unknown, action: string) {
  const ownerError = ownerErrorResponse(error)
  if (ownerError) return ownerError
  const databaseError = databaseErrorResponse(error)
  if (databaseError) return databaseError
  console.error(`Error ${action} owner settings`)
  return apiError(500, 'INTERNAL_ERROR', 'ไม่สามารถบันทึกหรืออ่าน owner settings ได้')
}

export async function GET() {
  try {
    const owner = await getOwner()
    const settings = await getOwnerSettings(owner.internalId)
    if (!settings) return apiError(404, 'NOT_FOUND', 'ไม่พบข้อมูล owner settings')
    return NextResponse.json(settings, { status: 200, headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    return handleUnexpectedError(error, 'reading')
  }
}

export async function PATCH(request: Request) {
  try {
    const owner = await getOwner()
    let body: unknown
    try {
      body = await request.json()
    } catch {
      return apiError(400, 'VALIDATION_ERROR', 'กรุณาส่ง JSON ที่ถูกต้อง')
    }

    const parsed = parseOwnerSettingsPatch(body)
    if (parsed.error) {
      return apiError(400, 'VALIDATION_ERROR', parsed.error.message, parsed.error.field)
    }
    const settings = await updateOwnerSettings(owner.internalId, parsed.data ?? {})
    return NextResponse.json(settings, { status: 200, headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    return handleUnexpectedError(error, 'updating')
  }
}
