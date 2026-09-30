import { headers } from 'next/headers'
import { timingSafeEqual } from 'node:crypto'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export class OwnerUnavailableError extends Error {
  constructor(message: string, readonly status: 401 | 503) {
    super(message)
  }
}

export function ownerErrorResponse(error: unknown) {
  if (!(error instanceof OwnerUnavailableError)) return null
  const unauthenticated = error.status === 401
  return NextResponse.json({
    error: {
      code: unauthenticated ? 'OWNER_UNAUTHENTICATED' : 'DEPENDENCY_UNAVAILABLE',
      message: unauthenticated ? 'กรุณายืนยันตัวตนเจ้าของระบบ' : 'ไม่พบเจ้าของระบบที่กำหนดไว้อย่างถูกต้อง',
    },
  }, { status: error.status, headers: { 'Cache-Control': 'no-store' } })
}

function hasOwnerProof(proof: string | null, expected: string | undefined) {
  if (!proof || !expected) return false
  const actualBytes = Buffer.from(proof)
  const expectedBytes = Buffer.from(expected)
  return actualBytes.length === expectedBytes.length && timingSafeEqual(actualBytes, expectedBytes)
}

export async function getOwner() {
  const requestHeaders = await headers()
  const authenticated = requestHeaders.get('x-pms-owner-authenticated') === '1'
  const validProof = hasOwnerProof(
    requestHeaders.get('x-pms-owner-proof'),
    process.env.PMS_INTERNAL_OWNER_PROOF,
  )
  if (!authenticated || !validProof) {
    throw new OwnerUnavailableError('Owner access required', 401)
  }
  const ownerId = process.env.OWNER_USER_ID?.trim()
  const users = await prisma.user.findMany({
    ...(ownerId ? { where: { id: ownerId } } : {}),
    take: 2,
    select: { id: true, name: true, email: true, avatar: true, role: true, status: true },
  })
  if (users.length !== 1) throw new OwnerUnavailableError('Exactly one owner User must exist', 503)
  return users[0]
}
