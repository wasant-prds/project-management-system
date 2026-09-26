import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { shouldStampSubmittedAt } from '@/lib/work-items'
import { parseWorkItemInput, type ParsedWorkItemInput } from '@/lib/work-item-input'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

// POST /api/work-items/import
export async function POST(request: Request) {
  try {
    const body: unknown = await request.json()
    const rows = Array.isArray(body)
      ? body
      : isRecord(body) && Array.isArray(body.workItems)
        ? body.workItems
        : null

    if (!rows || rows.length === 0) {
      return NextResponse.json(
        { error: 'A non-empty JSON array of work items is required' },
        { status: 400 },
      )
    }

    const inputs: ParsedWorkItemInput[] = []
    for (let index = 0; index < rows.length; index += 1) {
      const result = parseWorkItemInput(rows[index])
      if ('error' in result) {
        return NextResponse.json(
          { error: `Row ${index + 1}: ${result.error}`, row: index + 1 },
          { status: 400 },
        )
      }
      inputs.push(result.data)
    }

    const projectIds = [...new Set(inputs.map((item) => item.projectId))]
    const assigneeIds = [...new Set(inputs.map((item) => item.assigneeId))]
    const [projects, users] = await Promise.all([
      prisma.project.findMany({ where: { id: { in: projectIds } }, select: { id: true } }),
      prisma.user.findMany({ where: { id: { in: assigneeIds } }, select: { id: true } }),
    ])
    const projectIdSet = new Set(projects.map((project) => project.id))
    const assigneeIdSet = new Set(users.map((user) => user.id))

    for (let index = 0; index < inputs.length; index += 1) {
      const item = inputs[index]
      if (!projectIdSet.has(item.projectId)) {
        return NextResponse.json(
          { error: `Row ${index + 1}: Project not found`, row: index + 1 },
          { status: 404 },
        )
      }
      if (!assigneeIdSet.has(item.assigneeId)) {
        return NextResponse.json(
          { error: `Row ${index + 1}: Assignee not found`, row: index + 1 },
          { status: 404 },
        )
      }
    }

    const submittedAt = new Date()
    const data = inputs.map(({ id, ...item }) => ({
      ...(id ? { id } : {}),
      ...item,
      submittedAt: shouldStampSubmittedAt(item.status) ? submittedAt : null,
    }))

    const result = await prisma.workItem.createMany({ data })
    return NextResponse.json({ imported: result.count }, { status: 201 })
  } catch (error) {
    if (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === 'P2002'
    ) {
      return NextResponse.json(
        { error: 'One or more work item IDs already exist. Nothing was imported.' },
        { status: 409 },
      )
    }

    console.error('Error importing work items:', error)
    return NextResponse.json(
      { error: 'Failed to import work items' },
      { status: 500 },
    )
  }
}
