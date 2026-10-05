import { headers } from 'next/headers'
import { timingSafeEqual } from 'node:crypto'
import { resolve } from 'node:path'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { classifyOwnerSelector, readLiveIdentityFile, resolveLivePublicId } from '@/lib/legacy-identity'

export class OwnerUnavailableError extends Error {
  constructor(message: string, readonly status: 401 | 503) {
    super(message)
  }
}

export type OwnerIdentity = {
  id: string
  internalId: bigint
  name: string
  email: string
  avatar: string | null
  role: string
  status: string
}

const ownerSelect = {
  id: true,
  publicId: true,
  name: true,
  email: true,
  avatar: true,
  role: true,
  status: true,
} as const

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

export function ownerProfile(owner: OwnerIdentity) {
  return {
    id: owner.id,
    name: owner.name,
    email: owner.email,
    avatar: owner.avatar,
    role: owner.role,
    status: owner.status,
  }
}

function hasOwnerProof(proof: string | null, expected: string | undefined) {
  if (!proof || !expected) return false
  const actualBytes = Buffer.from(proof)
  const expectedBytes = Buffer.from(expected)
  return actualBytes.length === expectedBytes.length && timingSafeEqual(actualBytes, expectedBytes)
}

function toOwner(user: {
  id: bigint
  publicId: string
  name: string
  email: string
  avatar: string | null
  role: string
  status: string
}): OwnerIdentity {
  return {
    id: user.publicId,
    internalId: user.id,
    name: user.name,
    email: user.email,
    avatar: user.avatar,
    role: user.role,
    status: user.status,
  }
}

function liveIdentityRecords() {
  const configured = process.env.OWNER_IDENTITY_MAP?.trim()
  const filePath = configured && configured.length > 0
    ? configured
    : resolve(process.cwd(), 'database/live-identity/mappings.json')
  return readLiveIdentityFile(filePath)
}

async function ownerByPublicId(publicId: string) {
  const user = await prisma.user.findUnique({ where: { publicId }, select: ownerSelect })
  if (!user || user.publicId !== publicId) throw new OwnerUnavailableError('Exactly one owner User must exist', 503)
  return toOwner(user)
}

export async function getOwner(): Promise<OwnerIdentity> {
  const requestHeaders = await headers()
  const authenticated = requestHeaders.get('x-pms-owner-authenticated') === '1'
  const validProof = hasOwnerProof(
    requestHeaders.get('x-pms-owner-proof'),
    process.env.PMS_INTERNAL_OWNER_PROOF,
  )
  if (!authenticated || !validProof) {
    throw new OwnerUnavailableError('Owner access required', 401)
  }

  const selector = classifyOwnerSelector(process.env.OWNER_USER_ID?.trim())
  if (selector.kind === 'rejected') throw new OwnerUnavailableError('Exactly one owner User must exist', 503)
  if (selector.kind === 'public') return ownerByPublicId(selector.publicId)
  if (selector.kind === 'legacy') {
    let records: unknown[]
    try {
      records = liveIdentityRecords()
    } catch {
      throw new OwnerUnavailableError('Exactly one owner User must exist', 503)
    }
    const publicId = resolveLivePublicId('users', selector.oldId, records)
    if (!publicId) throw new OwnerUnavailableError('Exactly one owner User must exist', 503)
    return ownerByPublicId(publicId)
  }

  const users = await prisma.user.findMany({ take: 2, select: ownerSelect })
  if (users.length !== 1) throw new OwnerUnavailableError('Exactly one owner User must exist', 503)
  return toOwner(users[0])
}
