import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { shouldStampSubmittedAt } from '@/lib/work-items'
import { parseWorkItemInput, type ParsedWorkItemInput } from '@/lib/work-item-input'
import { getOwner, ownerErrorResponse } from '@/lib/owner'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function getImportRows(body: unknown): unknown[] | null {
  if (Array.isArray(body)) return body
  if (!isRecord(body)) return null
  if (Array.isArray(body.workItems)) return body.workItems
  return null
}

function parseImportRows(
  rows: unknown[],
  ownerId: string,
): { inputs: ParsedWorkItemInput[] } | { error: string; row: number } {
  const inputs: ParsedWorkItemInput[] = []
  for (let index = 0; index < rows.length; index += 1) {
    const result = parseWorkItemInput(rows[index], ownerId)
    if ('error' in result) {
      return { error: `Row ${index + 1}: ${result.error}`, row: index + 1 }
    }
    inputs.push(result.data)
  }
  return { inputs }
}

async function findMissingProjectId(inputs: ParsedWorkItemInput[]): Promise<string | null> {
  const projectIds = [...new Set(inputs.map((item) => item.projectId))]
  const projects = await prisma.project.findMany({ where: { id: { in: projectIds } }, select: { id: true } })
  const projectIdSet = new Set(projects.map((project) => project.id))

  for (const item of inputs) {
    if (!projectIdSet.has(item.projectId)) return item.projectId
  }
  return null
}

function isDuplicateIdError(error: unknown): boolean {
  return isRecord(error) && error.code === 'P2002'
}

// POST /api/work-items/import
export async function POST(request: Request) {
  try {
    const owner = await getOwner()
    const body: unknown = await request.json()
    const rows = getImportRows(body)

    if (!rows || rows.length === 0) {
      return NextResponse.json(
        { error: 'A non-empty JSON array of work items is required' },
        { status: 400 },
      )
    }

    const parsed = parseImportRows(rows, owner.id)
    if ('error' in parsed) {
      return NextResponse.json(
        { error: parsed.error, row: parsed.row },
        { status: 400 },
      )
    }

    const missingProjectId = await findMissingProjectId(parsed.inputs)
    if (missingProjectId) {
      const row = parsed.inputs.findIndex((item) => item.projectId === missingProjectId) + 1
      return NextResponse.json(
        { error: `Row ${row}: Project not found`, row },
        { status: 404 },
      )
    }

    const submittedAt = new Date()
    const data = parsed.inputs.map(({ id, ...item }) => ({
      ...(id ? { id } : {}),
      ...item,
      submittedAt: shouldStampSubmittedAt(item.status) ? submittedAt : null,
    }))

    const result = await prisma.workItem.createMany({ data })
    return NextResponse.json({ imported: result.count }, { status: 201 })
  } catch (error) {
    const ownerError = ownerErrorResponse(error)
    if (ownerError) return ownerError
    if (isDuplicateIdError(error)) {
      return NextResponse.json(
        { error: 'One or more work item IDs already exist. Nothing was imported.' },
        { status: 409 },
      )
    }

    console.error('Error importing work items:')
    return NextResponse.json(
      { error: 'Failed to import work items' },
      { status: 500 },
    )
  }
}
