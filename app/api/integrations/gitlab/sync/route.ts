import { NextResponse } from 'next/server'
import { getOwner, ownerErrorResponse } from '@/lib/owner'

// Retired: this endpoint cannot enforce the per-project assignee policy.
export async function POST() {
  try {
    await getOwner()
    return NextResponse.json(
      {
        error: {
          code: 'PROJECT_SYNC_REQUIRED',
          message: 'กรุณา sync จาก Project → Integrations โดยสร้าง config และระบุ assignee ก่อน',
        },
      },
      { status: 409, headers: { 'Cache-Control': 'no-store' } },
    )
  } catch (error) {
    return (
      ownerErrorResponse(error) ??
      NextResponse.json(
        { error: { code: 'INTERNAL_ERROR', message: 'ตรวจสอบสิทธิ์ sync ไม่สำเร็จ' } },
        { status: 500, headers: { 'Cache-Control': 'no-store' } },
      )
    )
  }
}
