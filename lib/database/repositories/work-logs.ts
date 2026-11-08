import { database } from '../client'
import { sql, syntax, and, type Sql } from '../sql'
import { workLogColumns } from '../projections'
import { insertRecord, updateRecord } from '../records'
import type { WorkLog, WorkLogView } from '../types'

export const workLogJoins = syntax(
  'JOIN users u ON u.id=l.user_id LEFT JOIN work_items w ON w.id=l.work_item_id LEFT JOIN projects p ON p.id=w.project_id LEFT JOIN companies c ON c.id=p.company_id LEFT JOIN projects lp ON lp.id=l.project_id',
)
const relations = sql`jsonb_build_object('publicId',u.public_id,'name',u.name,'email',u.email,'avatar',u.avatar_url) AS "user",
  CASE WHEN lp.id IS NULL THEN NULL ELSE jsonb_build_object('publicId',lp.public_id,'name',lp.name,'colorProject',lp.color) END AS project,
  CASE WHEN w.id IS NULL THEN NULL ELSE jsonb_build_object('publicId',w.public_id,'title',w.title,'kind',w.kind,'status',w.status,'assigneeId',w.assignee_id::text) END AS "workItem"`
type RawLogView = Omit<WorkLogView, 'workItem'> & {
  workItem: (Omit<NonNullable<WorkLogView['workItem']>, 'assigneeId'> & { assigneeId: string }) | null
}
const hydrate = (row: RawLogView): WorkLogView => ({
  ...row,
  workItem: row.workItem ? { ...row.workItem, assigneeId: BigInt(row.workItem.assigneeId) } : null,
})
export type WorkLogChanges = Partial<Omit<WorkLog, 'id' | 'publicId' | 'createdAt' | 'updatedAt'>>
const columns = (data: WorkLogChanges) => ({
  description: data.description,
  remarks: data.remarks,
  work_date: data.date,
  hours: data.hours,
  status: data.status,
  user_id: data.userId,
  project_id: data.projectId,
  work_item_id: data.workItemId,
})
export const workLogs = {
  async byPublicId(publicId: string, ownerId: bigint, connection = database) {
    const row = await connection.one<RawLogView>(
      sql`SELECT ${workLogColumns},${relations} FROM work_logs l ${workLogJoins} WHERE l.public_id=${publicId}::uuid AND l.user_id=${ownerId}`,
    )
    return row ? hydrate(row) : null
  },
  async byId(id: bigint, connection = database) {
    const row = await connection.one<RawLogView>(
      sql`SELECT ${workLogColumns},${relations} FROM work_logs l ${workLogJoins} WHERE l.id=${id}`,
    )
    return row ? hydrate(row) : null
  },
  async list(where: Sql, limit?: number, connection = database) {
    const rows = await connection.rows<RawLogView>(
      sql`SELECT ${workLogColumns},${relations} FROM work_logs l ${workLogJoins} WHERE ${where} ORDER BY l.work_date DESC,l.id DESC ${limit === undefined ? syntax('') : sql`LIMIT ${limit}`}`,
    )
    return rows.map(hydrate)
  },
  async create(data: WorkLogChanges, connection = database) {
    const row = await workLogs.byId(await insertRecord(connection, 'work_logs', columns(data)), connection)
    if (!row) throw new Error('Work log no longer exists')
    return row
  },
  async update(id: bigint, data: WorkLogChanges, connection = database) {
    await updateRecord(connection, 'work_logs', id, columns(data))
    const row = await workLogs.byId(id, connection)
    if (!row) throw new Error('Work log no longer exists')
    return row
  },
  remove: (id: bigint, ownerId: bigint, connection = database) =>
    connection.execute(sql`DELETE FROM work_logs WHERE id=${id} AND user_id=${ownerId}`),
  countForWorkItem: async (id: bigint, connection = database) =>
    (await connection.one<{ count: number }>(
      sql`SELECT count(*)::int AS count FROM work_logs WHERE work_item_id=${id}`,
    ))!.count,
  forWorkItem: (id: bigint, ownerId: bigint, connection = database) =>
    workLogs.list(and(sql`l.work_item_id=${id}`, sql`l.user_id=${ownerId}`), undefined, connection),
}
