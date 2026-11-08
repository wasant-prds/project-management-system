import { database } from '../client'
import { sql, and, type Sql } from '../sql'
import { workItemJoins } from './work-items'
import { workLogJoins } from './work-logs'
import { workLogColumns } from '../projections'
import type { Company, ProjectParty, WorkLog } from '../types'

export type ReportProjectFilter = { projectInternalId?: bigint | null; companyInternalId?: bigint | null }
export type ReportLog = WorkLog & {
  workItem: { publicId: string; title: string; project: ProjectParty } | null
}
export const reports = {
  companies: (connection = database) =>
    connection.rows<Pick<Company, 'publicId' | 'name' | 'displayName'>>(
      sql`SELECT public_id AS "publicId",name,display_name AS "displayName" FROM companies ORDER BY name,id`,
    ),
  projects: (filters: ReportProjectFilter = {}, connection = database) =>
    connection.rows<{ publicId: string; name: string; company: { publicId: string } }>(sql`
    SELECT p.public_id AS "publicId",p.name,jsonb_build_object('publicId',c.public_id) AS company FROM projects p JOIN companies c ON c.id=p.company_id
    WHERE ${and(filters.projectInternalId ? sql`p.id=${filters.projectInternalId}` : null, filters.companyInternalId ? sql`p.company_id=${filters.companyInternalId}` : null)} ORDER BY p.name,p.id`),
  counts: async (where: Sql, today: Date, connection = database) =>
    (await connection.one<{ total: number; completed: number; cancelled: number; overdue: number }>(sql`
    SELECT count(*)::int AS total,count(*) FILTER(WHERE w.status='completed')::int AS completed,count(*) FILTER(WHERE w.status='cancelled')::int AS cancelled,
    count(*) FILTER(WHERE w.due_date<${today} AND w.status NOT IN ('completed','cancelled'))::int AS overdue FROM work_items w ${workItemJoins} WHERE ${where}`))!,
  hours: async (where: Sql, connection = database) =>
    (await connection.one<{ hours: string }>(
      sql`SELECT COALESCE(sum(l.hours),0)::text AS hours FROM work_logs l ${workLogJoins} WHERE ${where}`,
    ))!.hours,
  hoursByDate: (where: Sql, connection = database) =>
    connection.rows<{ date: Date; hours: string }>(
      sql`SELECT l.work_date AS date,sum(l.hours)::text AS hours FROM work_logs l ${workLogJoins} WHERE ${where} GROUP BY l.work_date ORDER BY l.work_date`,
    ),
  projectProgress: (ids: bigint[], ownerId: bigint, connection = database) =>
    connection.rows<{ projectId: bigint; status: string; _count: { _all: number } }>(sql`
    SELECT w.project_id AS "projectId",w.status,jsonb_build_object('_all',count(*)::int) AS _count FROM work_items w WHERE w.project_id=ANY(${ids}::bigint[]) AND w.assignee_id=${ownerId} GROUP BY w.project_id,w.status`),
  logs: (where: Sql, ownerId: bigint, connection = database) =>
    connection.rows<ReportLog>(sql`
    SELECT ${workLogColumns},CASE WHEN w.id IS NULL OR w.assignee_id<>${ownerId} THEN NULL ELSE jsonb_build_object('publicId',w.public_id,'title',w.title,
      'project',jsonb_build_object('publicId',p.public_id,'name',p.name,'colorProject',p.color,'company',jsonb_build_object('publicId',c.public_id,'name',c.name,'displayName',c.display_name))) END AS "workItem"
    FROM work_logs l ${workLogJoins} WHERE ${where} ORDER BY l.work_date DESC,l.id DESC`),
}
