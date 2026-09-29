import { NextResponse, type NextRequest } from 'next/server'

function sameProof(actual: string | null, expected: string | undefined) {
  if (!actual || !expected || actual.length !== expected.length) return false
  let difference = 0
  for (let i = 0; i < expected.length; i++) {
    difference |= (actual.codePointAt(i) ?? 0) ^ (expected.codePointAt(i) ?? 0)
  }
  return difference === 0
}

export function middleware(request: NextRequest) {
  if (request.nextUrl.pathname === '/api/health' && request.method === 'GET') {
    return NextResponse.next()
  }
  if (sameProof(request.headers.get('x-pms-owner-proof'), process.env.PMS_INTERNAL_OWNER_PROOF)) {
    const headers = new Headers(request.headers)
    headers.set('x-pms-owner-authenticated', '1')
    return NextResponse.next({ request: { headers } })
  }
  if (request.nextUrl.pathname.startsWith('/api/')) {
    return NextResponse.json(
      { error: { code: 'OWNER_UNAUTHENTICATED', message: 'กรุณายืนยันตัวตนเจ้าของระบบ' } },
      { status: 401, headers: { 'Cache-Control': 'no-store' } },
    )
  }
  return new NextResponse('กรุณายืนยันตัวตนเจ้าของระบบ', {
    status: 401,
    headers: { 'content-type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' },
  })
}

export const config = { matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'] }
