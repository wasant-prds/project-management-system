import { database } from '../client'
import { sql, syntax, and, type Sql } from '../sql'
import { workItemColumns } from '../projections'
import { insertRecord, insertImportedRecord, updateRecord } from '../records'
import type { WorkItem, WorkItemView } from '../types'

export const workItemJoins = syntax(
  'JOIN projects p ON p.id=w.project_id JOIN companies c ON c.id=p.company_id JOIN users u ON u.id=w.assignee_id LEFT JOIN external_work_item_references r ON r.work_item_id=w.id',
)
const relations = sql`
  jsonb_build_object('publicId',u.public_id,'name',u.name,'email',u.email,'avatar',u.avatar_url) AS assignee,
  jsonb_build_object('publicId',p.public_id,'name',p.name,'colorProject',p.color,
    'company',jsonb_build_object('publicId',c.public_id,'name',c.name,'displayName',c.display_name)) AS project,
  CASE WHEN r.id IS NULL THEN NULL ELSE jsonb_build_object('provider',r.provider,'externalUrl',r.external_url,'externalIssueNumber',r.external_issue_number,'inScope',r.in_scope) END AS "externalReference"`
export type WorkItemChanges = Partial<Omit<WorkItem, 'id' | 'publicId' | 'createdAt' | 'updatedAt'>>
const columns = (data: WorkItemChanges) => ({
  title: data.title,
  description: data.description,
  kind: data.kind,
  priority: data.priority,
  functional_role: data.role,
  status: data.status,
  type_labels: data.types,
  work_date: data.workDate,
  due_date: data.dueDate,
  submitted_at: data.submittedAt,
  project_id: data.projectId,
  assignee_id: data.assigneeId,
})
export const workItems = {
  byPublicId: (publicId: string, ownerId?: bigint, connection = database) =>
    connection.one<WorkItemView>(
      sql`SELECT ${workItemColumns},${relations} FROM work_items w ${workItemJoins} WHERE ${and(sql`w.public_id=${publicId}::uuid`, ownerId ? sql`w.assignee_id=${ownerId}` : null)}`,
    ),
  byId: (id: bigint, connection = database) =>
    connection.one<WorkItemView>(
      sql`SELECT ${workItemColumns},${relations} FROM work_items w ${workItemJoins} WHERE w.id=${id}`,
    ),
  list: (where: Sql, order = syntax('w.created_at DESC,w.id DESC'), limit?: number, connection = database) =>
    connection.rows<WorkItemView>(
      sql`SELECT ${workItemColumns},${relations} FROM work_items w ${workItemJoins} WHERE ${where} ORDER BY ${order} ${limit === undefined ? syntax('') : sql`LIMIT ${limit}`}`,
    ),
  count: async (where: Sql, connection = database) =>
    (await connection.one<{ count: number }>(
      sql`SELECT count(*)::int AS count FROM work_items w ${workItemJoins} WHERE ${where}`,
    ))!.count,
  async create(data: WorkItemChanges, connection = database) {
    const row = await workItems.byId(await insertRecord(connection, 'work_items', columns(data)), connection)
    if (!row) throw new Error('Work item no longer exists')
    return row
  },
  async import(data: WorkItemChanges, publicId: string | null, connection = database) {
    if (!publicId) return workItems.create(data, connection)
    const id = await insertImportedRecord(connection, 'work_items', publicId, columns(data))
    return (await workItems.byId(id, connection))!
  },
  async update(id: bigint, data: WorkItemChanges, connection = database) {
    await updateRecord(connection, 'work_items', id, columns(data))
    const row = await workItems.byId(id, connection)
    if (!row) throw new Error('Work item no longer exists')
    return row
  },
  remove: (id: bigint, ownerId: bigint, connection = database) =>
    connection.execute(sql`DELETE FROM work_items WHERE id=${id} AND assignee_id=${ownerId}`),
  async lock(id: bigint, ownerId: bigint, connection = database) {
    await connection.rows(sql`SELECT id FROM work_items WHERE id=${id} AND assignee_id=${ownerId} FOR UPDATE`)
  },
  syncCandidates: (projectId: bigint, ownerId: bigint, connection = database) =>
    connection.rows<WorkItem>(sql`SELECT ${workItemColumns} FROM work_items w LEFT JOIN external_work_item_references r ON r.work_item_id=w.id
      WHERE w.project_id=${projectId} AND w.assignee_id=${ownerId} AND r.id IS NULL
      ORDER BY w.id`),
  years: async (ownerId: bigint, connection = database) =>
    (
      await connection.rows<{ year: number }>(sql`
    SELECT DISTINCT EXTRACT(YEAR FROM COALESCE(work_date,due_date,created_at))::int AS year
    FROM work_items WHERE assignee_id=${ownerId} ORDER BY year DESC`)
    ).map((row) => row.year),
}
