import { database } from '../client'
import { sql, and, literalContains } from '../sql'
import { companyColumns } from '../projections'
import { insertRecord, updateRecord } from '../records'
import type { Company } from '../types'

export type CompanyChanges = Partial<
  Pick<
    Company,
    | 'code'
    | 'displayName'
    | 'location'
    | 'name'
    | 'industry'
    | 'email'
    | 'phone'
    | 'address'
    | 'website'
    | 'logo'
    | 'description'
  >
>
const columns = (data: CompanyChanges) => ({
  code: data.code,
  display_name: data.displayName,
  location: data.location,
  name: data.name,
  industry: data.industry,
  email: data.email,
  phone: data.phone,
  address: data.address,
  website_url: data.website,
  logo_url: data.logo,
  description: data.description,
})
export const companies = {
  byPublicId: (publicId: string, connection = database) =>
    connection.one<Company>(
      sql`SELECT ${companyColumns} FROM companies c WHERE c.public_id=${publicId}::uuid`,
    ),
  byId: (id: bigint, connection = database) =>
    connection.one<Company>(sql`SELECT ${companyColumns} FROM companies c WHERE c.id=${id}`),
  dhasCandidates: (name: string, connection = database) =>
    connection.rows<Company>(
      sql`SELECT ${companyColumns} FROM companies c WHERE c.code='dhas' OR c.name=${name} ORDER BY c.id LIMIT 2`,
    ),
  async list(search: string, limit: number, cursor?: bigint, connection = database) {
    return connection.rows<Company>(sql`SELECT ${companyColumns} FROM companies c
      WHERE ${and(
        search
          ? sql`(c.name ILIKE ${literalContains(search)} OR c.display_name ILIKE ${literalContains(search)})`
          : null,
        cursor ? sql`(c.name,c.id) > (SELECT name,id FROM companies WHERE id=${cursor})` : null,
      )} ORDER BY c.name,c.id LIMIT ${limit}`)
  },
  async summaries(ids: bigint[], connection = database) {
    return connection.rows<{
      companyId: bigint
      projectCount: number
      workItemCount: number
      hours: string
    }>(sql`
      SELECT c.id AS "companyId", (SELECT count(*)::int FROM projects p WHERE p.company_id=c.id) AS "projectCount",
        (SELECT count(*)::int FROM work_items w JOIN projects p ON p.id=w.project_id WHERE p.company_id=c.id) AS "workItemCount",
        COALESCE((SELECT sum(l.hours)::text FROM work_logs l JOIN projects p ON p.id=l.project_id WHERE p.company_id=c.id),'0') AS hours
      FROM companies c WHERE c.id=ANY(${ids}::bigint[])`)
  },
  async create(data: CompanyChanges, connection = database) {
    return companies.byId(await insertRecord(connection, 'companies', columns(data)), connection)
  },
  async update(id: bigint, data: CompanyChanges, connection = database) {
    await updateRecord(connection, 'companies', id, columns(data))
    return companies.byId(id, connection)
  },
  projectCount: async (id: bigint, connection = database) =>
    (await connection.one<{ count: number }>(
      sql`SELECT count(*)::int AS count FROM projects WHERE company_id=${id}`,
    ))!.count,
  remove: (id: bigint, connection = database) =>
    connection.execute(sql`DELETE FROM companies WHERE id=${id}`),
}
