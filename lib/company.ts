import { prisma } from '@/lib/db'
import dhasCompany from '@/lib/dhas-company.json'

export const DHAS_COMPANY = dhasCompany
export class CompanyConflictError extends Error {}

export const COMPANY_FIELDS = ['name', 'displayName', 'location', 'industry', 'email', 'phone', 'address', 'website', 'logo', 'description'] as const

export function parseCompanyInput(body: unknown, partial = false) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { error: 'Invalid body', field: 'body' }
  const input = body as Record<string, unknown>
  const unsupported = Object.keys(input).find((key) => !COMPANY_FIELDS.includes(key as typeof COMPANY_FIELDS[number]))
  if (unsupported) return { error: 'Unsupported field', field: unsupported }
  if (!partial && (typeof input.name !== 'string' || !input.name.trim())) return { error: 'Name is required', field: 'name' }
  if (partial && Object.keys(input).length === 0) return { error: 'No changes supplied', field: 'body' }
  const data: Record<string, string | null> = {}
  for (const field of COMPANY_FIELDS) {
    const value = input[field]
    if (value === undefined) continue
    if (field === 'name') {
      if (typeof value !== 'string' || !value.trim()) return { error: 'Name is required', field }
      data.name = value.trim()
    } else {
      if (value !== null && typeof value !== 'string') return { error: 'Invalid text', field }
      data[field] = typeof value === 'string' ? value.trim() || null : null
    }
  }
  return { data }
}

export async function getOrCreateDhasCompany() {
  const matches = await prisma.company.findMany({ where: { OR: [{ code: 'dhas' }, { name: DHAS_COMPANY.name }] }, take: 2 })
  if (matches.length > 1) throw new CompanyConflictError('พบ Dhas Company ซ้ำกัน')
  if (matches.length === 1) {
    const existing = matches[0]
    if (existing.code === 'dhas' && existing.name !== DHAS_COMPANY.name) throw new CompanyConflictError('รหัส Dhas ผูกกับ Company อื่น')
    if (existing.code === 'dhas') return existing
    return prisma.company.update({ where: { id: existing.id }, data: { code: 'dhas' } })
  }
  return prisma.company.upsert({ where: { code: 'dhas' }, create: { code: 'dhas', ...DHAS_COMPANY }, update: {} })
}
