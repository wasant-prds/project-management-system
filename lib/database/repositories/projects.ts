import { database } from '../client'
import { sql, and, literalContains } from '../sql'
import { projectColumns } from '../projections'
import { insertRecord, updateRecord } from '../records'
import type { Project, ProjectView } from '../types'

const relations = sql`
  jsonb_build_object('publicId',c.public_id,'name',c.name,'displayName',c.display_name) AS company,
  COALESCE((SELECT jsonb_agg(jsonb_build_object('status',w.status,'role',w.functional_role)) FROM work_items w WHERE w.project_id=p.id),'[]') AS "workItems",
  COALESCE((SELECT jsonb_agg(jsonb_build_object('hours',l.hours::text)) FROM work_logs l WHERE l.project_id=p.id),'[]') AS "timeEntries"`
export type ProjectChanges = Partial<Omit<Project, 'id' | 'publicId' | 'createdAt' | 'updatedAt'>>
const columns = (data: ProjectChanges) => ({
  name: data.name,
  description: data.description,
  status: data.status,
  priority: data.priority,
  start_date: data.startDate,
  due_date: data.dueDate,
  budget_amount: data.budget,
  spent_amount: data.spent,
  progress_percent: data.progress,
  color: data.colorProject,
  creator_id: data.creatorId,
  company_id: data.companyId,
})
export const projects = {
  byPublicId: (publicId: string, connection = database) =>
    connection.one<ProjectView>(
      sql`SELECT ${projectColumns},${relations} FROM projects p JOIN companies c ON c.id=p.company_id WHERE p.public_id=${publicId}::uuid`,
    ),
  byId: (id: bigint, connection = database) =>
    connection.one<ProjectView>(
      sql`SELECT ${projectColumns},${relations} FROM projects p JOIN companies c ON c.id=p.company_id WHERE p.id=${id}`,
    ),
  list: (
    filter: {
      status?: string | null
      companyId?: bigint | null
      projectId?: bigint | null
      search?: string | null
      limit: number
      cursor?: bigint
    },
    connection = database,
  ) =>
    connection.rows<ProjectView>(sql`
    SELECT ${projectColumns},${relations} FROM projects p JOIN companies c ON c.id=p.company_id
    WHERE ${and(
      filter.projectId ? sql`p.id=${filter.projectId}` : null,
      filter.status ? sql`p.status=${filter.status}` : null,
      filter.companyId ? sql`p.company_id=${filter.companyId}` : null,
      filter.search ? sql`p.name ILIKE ${literalContains(filter.search)}` : null,
      filter.cursor
        ? sql`(p.created_at,p.id) < (SELECT created_at,id FROM projects WHERE id=${filter.cursor})`
        : null,
    )}
    ORDER BY p.created_at DESC,p.id DESC LIMIT ${filter.limit}`),
  options: (connection = database) =>
    connection.rows<Pick<Project, 'publicId' | 'name' | 'colorProject'>>(
      sql`SELECT p.public_id AS "publicId",p.name,p.color AS "colorProject" FROM projects p ORDER BY p.created_at DESC,p.id DESC`,
    ),
  async create(data: ProjectChanges, connection = database) {
    return projects.byId(await insertRecord(connection, 'projects', columns(data)), connection)
  },
  async update(id: bigint, data: ProjectChanges, connection = database) {
    await updateRecord(connection, 'projects', id, columns(data))
    return projects.byId(id, connection)
  },
  remove: (id: bigint, connection = database) => connection.execute(sql`DELETE FROM projects WHERE id=${id}`),
  historyCounts: (id: bigint, connection = database) =>
    connection.one<{
      workItems: number
      timeEntries: number
      members: number
      documents: number
      milestones: number
      activityLogs: number
      mappings: number
      references: number
    }>(sql`
    SELECT (SELECT count(*)::int FROM work_items WHERE project_id=${id}) AS "workItems",
    (SELECT count(*)::int FROM work_logs WHERE project_id=${id}) AS "timeEntries",
    (SELECT count(*)::int FROM project_members WHERE project_id=${id}) AS members,
    (SELECT count(*)::int FROM project_documents WHERE project_id=${id}) AS documents,
    (SELECT count(*)::int FROM project_milestones WHERE project_id=${id}) AS milestones,
    (SELECT count(*)::int FROM activity_logs WHERE project_id=${id}) AS "activityLogs",
    (SELECT count(*)::int FROM external_project_mappings WHERE project_id=${id}) AS mappings,
    (SELECT count(*)::int FROM external_work_item_references WHERE project_id=${id}) AS references`),
}
