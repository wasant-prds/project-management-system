import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { shouldStampSubmittedAt } from '@/lib/work-items'
import { parseWorkItemInput } from '@/lib/work-item-input'
import { currentBangkokWallClockDate } from '@/lib/bangkok-datetime'
import { getOwner, ownerErrorResponse } from '@/lib/owner'
import { classifyReference } from '@/lib/public-id'
import { readLiveIdentityFile, resolveLivePublicId } from '@/lib/legacy-identity'
import { resolve } from 'node:path'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function getImportRows(body: unknown): unknown[] | null {
  if (Array.isArray(body)) return body
  if (!isRecord(body)) return null
  if (Array.isArray(body.workItems)) return body.workItems
  return null
}

function hasErrorCode(error: unknown, code: string) {
  return typeof error === 'object'
    && error !== null
    && 'code' in error
    && error.code === code
}

function rowError(row: number, code: string, message: string, field?: string) {
  return { row, outcome: 'failed', error: { code, message, ...(field ? { field } : {}) } }
}

function liveRecords() {
  const configured = process.env.OWNER_IDENTITY_MAP?.trim()
  const filePath = configured && configured.length > 0
    ? configured
    : resolve(process.cwd(), 'database/live-identity/mappings.json')
  return readLiveIdentityFile(filePath)
}

async function resolveImportReference(value: string | undefined, entityName: string): Promise<{ publicId: string | null } | { error: string }> {
  if (!value) return { publicId: null as string | null }
  const classified = classifyReference(value)
  if (classified.kind === 'rejected') return { error: 'ต้องเป็น public UUID' }
  if (classified.kind === 'public') return { publicId: classified.publicId }
  const publicId = resolveLivePublicId(entityName, classified.oldId, liveRecords())
  if (!publicId) return { error: 'legacy id is not in the live identity map' }
  return { publicId }
}

async function processImportRow(value: unknown, row: number, ownerPublicId: string, ownerInternalId: bigint) {
  const parsed = parseWorkItemInput(value, ownerPublicId)
  if ('error' in parsed) {
    return { result: rowError(row, 'VALIDATION_ERROR', parsed.error), imported: false }
  }

  const { id, ...input } = parsed.data
  try {
    const projectRef = await resolveImportReference(input.projectId, 'projects')
    if ('error' in projectRef || !projectRef.publicId) {
      return { result: rowError(row, 'VALIDATION_ERROR', 'error' in projectRef ? projectRef.error : 'Project not found', 'projectId'), imported: false }
    }
    const project = await prisma.project.findUnique({ where: { publicId: projectRef.publicId }, select: { id: true } })
    if (!project) {
      return { result: rowError(row, 'NOT_FOUND', 'Project not found', 'projectId'), imported: false }
    }

    const workItemRef = await resolveImportReference(id, 'work_items')
    if ('error' in workItemRef) {
      return { result: rowError(row, 'VALIDATION_ERROR', workItemRef.error, 'id'), imported: false }
    }
    if (workItemRef.publicId) {
      const existing = await prisma.workItem.findUnique({ where: { publicId: workItemRef.publicId }, select: { publicId: true } })
      if (existing) {
        return {
          result: {
            row,
            outcome: 'skipped',
            workItemId: existing.publicId,
            error: { code: 'DUPLICATE', message: 'Work Item ID already exists; existing data was left unchanged.' },
          },
          imported: false,
        }
      }
    }

    const workItem = await prisma.workItem.create({
      data: {
        ...(workItemRef.publicId ? { publicId: workItemRef.publicId } : {}),
        title: input.title,
        description: input.description,
        kind: input.kind,
        priority: input.priority,
        role: input.role,
        status: input.status,
        types: input.types,
        workDate: input.workDate,
        dueDate: input.dueDate,
        projectId: project.id,
        assigneeId: ownerInternalId,
        submittedAt: shouldStampSubmittedAt(input.status) ? currentBangkokWallClockDate() : null,
      },
      select: { publicId: true },
    })
    return { result: { row, outcome: 'created', workItemId: workItem.publicId }, imported: true }
  } catch (error) {
    if (hasErrorCode(error, 'P2003')) {
      return { result: rowError(row, 'NOT_FOUND', 'Project not found', 'projectId'), imported: false }
    }
    if (hasErrorCode(error, 'P2002')) {
      return {
        result: {
          row,
          outcome: 'skipped',
          error: { code: 'DUPLICATE', message: 'Work Item ID already exists; existing data was left unchanged.' },
        },
        imported: false,
      }
    }
    console.error('Error importing work item row:')
    return { result: rowError(row, 'IMPORT_FAILED', 'Work Item could not be imported'), imported: false }
  }
}

// POST /api/work-items/import
export async function POST(request: Request) {
  try {
    const owner = await getOwner()
    let body: unknown
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: { code: 'VALIDATION_ERROR', message: 'Request body must be valid JSON' } }, { status: 400 })
    }

    const rows = getImportRows(body)
    if (!rows || rows.length === 0) {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: 'A non-empty JSON array of work items is required' } },
        { status: 400 },
      )
    }

    const results: Array<Record<string, unknown>> = []
    let imported = 0
    for (let index = 0; index < rows.length; index += 1) {
      const processed = await processImportRow(rows[index], index + 1, owner.id, owner.internalId)
      results.push(processed.result)
      if (processed.imported) imported += 1
    }

    return NextResponse.json({ imported, rows: results }, { status: 200 })
  } catch (error) {
    const ownerError = ownerErrorResponse(error)
    if (ownerError) return ownerError
    console.error('Error importing work items:')
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'Failed to import work items' } },
      { status: 500 },
    )
  }
}
