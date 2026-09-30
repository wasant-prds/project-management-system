import { PrismaClient } from '@prisma/client'
import dhasCompany from '../lib/dhas-company.json' with { type: 'json' }

export const DHAS_COMPANY = dhasCompany

export function validateCompanyBackfill(companies, projects) {
  const errors = []
  const matches = companies.filter((company) => company.code === 'dhas' || company.name === DHAS_COMPANY.name)
  if (matches.length > 1) errors.push('More than one Dhas Company exists')
  const dhas = matches[0]
  if (dhas?.code === 'dhas' && dhas.name !== DHAS_COMPANY.name) errors.push('Dhas code belongs to another Company')
  for (const project of projects) {
    if (project.companyId && project.companyId !== dhas?.id) errors.push(`Project Company conflict: ${project.id}`)
  }
  return errors
}

export async function applyDhasBackfill(tx) {
  const companies = await tx.company.findMany({ select: { id: true, name: true, code: true } })
  const projects = await tx.project.findMany({ select: { id: true, companyId: true } })
  const errors = validateCompanyBackfill(companies, projects)
  if (errors.length) throw new Error(errors.join('\n'))
  let company = companies.find((item) => item.code === 'dhas' || item.name === DHAS_COMPANY.name)
  if (company && company.code !== 'dhas') {
    company = await tx.company.update({ where: { id: company.id }, data: { code: 'dhas' } })
  }
  company ??= await tx.company.upsert({
    where: { code: 'dhas' }, create: { code: 'dhas', ...DHAS_COMPANY }, update: {},
  })
  // Keep Project.updatedAt and every business date unchanged.
  await tx.$executeRaw`UPDATE "Project" SET "companyId" = ${company.id} WHERE "companyId" IS NULL`
  const remaining = await tx.project.count({ where: { companyId: null } })
  if (remaining) throw new Error(`${remaining} Projects remain unlinked`)
  return { companyId: company.id, projects: projects.length }
}

async function main() {
  const [command, environment] = process.argv.slice(2)
  if (!['--check', '--apply'].includes(command) || !environment) throw new Error('Usage: node scripts/company-project-backfill.mjs <--check|--apply> <environment>')
  if (process.env.APP_ENV !== environment) throw new Error('APP_ENV does not match requested environment')
  const db = new PrismaClient()
  try {
    const [companies, projects] = await Promise.all([
      db.company.findMany({ select: { id: true, name: true, code: true } }),
      db.project.findMany({ select: { id: true, companyId: true } }),
    ])
    const errors = validateCompanyBackfill(companies, projects)
    if (errors.length) throw new Error(errors.join('\n'))
    if (command === '--check') {
      console.log(`Dhas backfill ready: ${projects.length} Projects; no rows changed.`)
      return
    }
    const result = await db.$transaction((tx) => applyDhasBackfill(tx), { isolationLevel: 'Serializable' })
    console.log(`Dhas Company linked to ${result.projects} Projects.`)
  } finally { await db.$disconnect() }
}

if (process.argv[1]?.endsWith('company-project-backfill.mjs')) await main()
