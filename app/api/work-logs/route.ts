import { NextResponse } from 'next/server'
import { database } from '@/lib/database/client'
import { workLogs as logStore, type WorkLogChanges } from '@/lib/database/repositories/work-logs'
import { projects } from '@/lib/database/repositories/projects'
import { companies } from '@/lib/database/repositories/companies'
import { sql, and, type Sql } from '@/lib/database/sql'
import { WORK_ITEM_KINDS, WORK_ITEM_ROLES } from '@/lib/work-items'
import { getOwner, ownerErrorResponse } from '@/lib/owner'
import { bangkokDateRange } from '@/lib/bangkok-datetime'
import { parseCreateWorkLogInput, parseWorkLogRequestBody } from '@/lib/work-log-input'
import { lockOwnedWorkItemForUpdate } from '@/lib/work-item-lock'
import { resolveOwnedWorkItem, serializeWorkLog } from '@/lib/work-logs'
import { parsePublicId } from '@/lib/public-id'

function apiError(status: number, code: string, message: string, field?: string) {
  return NextResponse.json({ error: { code, message, ...(field ? { field } : {}) } }, { status })
}

function validationError(message: string, field?: string) {
  return apiError(400, 'VALIDATION_ERROR', message, field)
}

export async function GET(request: Request) {
  try {
    const owner = await getOwner()
    const { searchParams } = new URL(request.url)
    const date = searchParams.get('date')
    const startDate = searchParams.get('startDate')
    const endDate = searchParams.get('endDate')
    const userId = searchParams.get('userId')
    const companyId = searchParams.get('companyId')
    const projectId = searchParams.get('projectId')
    const role = searchParams.get('role')
    const kind = searchParams.get('kind')

    if (userId && userId !== owner.id) return validationError('userId ต้องเป็นเจ้าของระบบ', 'userId')
    if (date !== null && (startDate !== null || endDate !== null)) {
      return validationError('Use either date or a date range, not both', 'date')
    }

    if (
      role !== null &&
      role !== 'none' &&
      !WORK_ITEM_ROLES.includes(role as (typeof WORK_ITEM_ROLES)[number])
    ) {
      return validationError('Invalid Work Item role', 'role')
    }
    if (kind !== null && !WORK_ITEM_KINDS.includes(kind as (typeof WORK_ITEM_KINDS)[number])) {
      return validationError('Invalid Work Item kind', 'kind')
    }

    if (companyId !== null && !parsePublicId(companyId))
      return validationError('ต้องเป็น public UUID', 'companyId')
    if (projectId !== null && !parsePublicId(projectId))
      return validationError('ต้องเป็น public UUID', 'projectId')
    const company = companyId ? await companies.byPublicId(companyId) : null
    if (companyId && !company) return apiError(404, 'NOT_FOUND', 'Company not found', 'companyId')
    const project = projectId ? await projects.byPublicId(projectId) : null
    if (projectId && !project) return apiError(404, 'NOT_FOUND', 'Project not found', 'projectId')
    if (company && project && project.companyId !== company.id) {
      return apiError(
        400,
        'RELATION_MISMATCH',
        'Project does not belong to the selected Company',
        'projectId',
      )
    }

    const clauses: Sql[] = [sql`l.user_id=${owner.internalId}`]
    if (date !== null) {
      const range = bangkokDateRange(date)
      if (!range) return validationError('date must use a valid YYYY-MM-DD value', 'date')
      clauses.push(sql`l.work_date>=${range.start} AND l.work_date<${range.end}`)
    } else if ((startDate === null) !== (endDate === null)) {
      return validationError('startDate and endDate must be provided together', 'startDate')
    } else if (startDate !== null && endDate !== null) {
      const start = bangkokDateRange(startDate)
      const end = bangkokDateRange(endDate)
      if (!start || !end || end.start < start.start) {
        return validationError('startDate and endDate must be valid ordered dates', 'startDate')
      }
      clauses.push(sql`l.work_date>=${start.start} AND l.work_date<${end.end}`)
    }

    if (project) clauses.push(sql`w.project_id=${project.id}`)
    if (company) clauses.push(sql`p.company_id=${company.id}`)
    if (role === 'none') clauses.push(sql`w.id IS NOT NULL AND w.functional_role IS NULL`)
    else if (role) clauses.push(sql`w.functional_role=${role}`)
    if (kind) clauses.push(sql`w.kind=${kind}`)
    const workLogs = await logStore.list(and(...clauses))

    return NextResponse.json(
      { workLogs: workLogs.map((workLog) => serializeWorkLog(workLog, owner.internalId)) },
      { status: 200, headers: { 'Cache-Control': 'no-store' } },
    )
  } catch (error) {
    const ownerError = ownerErrorResponse(error)
    if (ownerError) return ownerError
    console.error('Error fetching work logs:')
    return apiError(500, 'INTERNAL_ERROR', 'Failed to fetch work logs')
  }
}

export async function POST(request: Request) {
  try {
    const owner = await getOwner()
    const body = await parseWorkLogRequestBody(request)
    if (!body.ok) return validationError(body.error.message, body.error.field)

    const input = parseCreateWorkLogInput(body.value, owner.id)
    if (!input.ok) return validationError(input.error.message, input.error.field)

    const outcome = await database.transaction(async (transaction) => {
      const workItem = await resolveOwnedWorkItem(input.value.workItemId, owner.internalId, transaction)
      if (!workItem) return { kind: 'work-item-missing' as const }
      await lockOwnedWorkItemForUpdate(transaction, workItem.id, owner.internalId)
      if (input.value.projectId !== undefined && input.value.projectId !== workItem.project.publicId) {
        return { kind: 'project-mismatch' as const }
      }

      const data: WorkLogChanges = {
        hours: input.value.hours,
        date: input.value.date,
        userId: owner.internalId,
        projectId: workItem.projectId,
        workItemId: workItem.id,
        ...(input.value.description !== undefined ? { description: input.value.description } : {}),
        ...(input.value.remarks !== undefined ? { remarks: input.value.remarks } : {}),
        ...(input.value.status !== undefined ? { status: input.value.status } : {}),
      }
      const workLog = await logStore.create(data, transaction)
      return { kind: 'created' as const, workLog }
    })

    if (outcome.kind === 'work-item-missing')
      return apiError(404, 'NOT_FOUND', 'Work Item not found', 'workItemId')
    if (outcome.kind === 'project-mismatch')
      return apiError(400, 'RELATION_MISMATCH', 'Project must match the Work Item Project', 'projectId')
    return NextResponse.json(
      { workLog: serializeWorkLog(outcome.workLog, owner.internalId) },
      { status: 201 },
    )
  } catch (error) {
    const ownerError = ownerErrorResponse(error)
    if (ownerError) return ownerError
    console.error('Error creating work log:')
    return apiError(500, 'INTERNAL_ERROR', 'Failed to save Daily Work')
  }
}
