import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

// GET /api/issues/[id] - Get a single issue
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const issue = await prisma.issue.findUnique({
      where: { id },
      include: {
        reporter: {
          select: {
            id: true,
            name: true,
            email: true,
            avatar: true,
          },
        },
        assignee: {
          select: {
            id: true,
            name: true,
            email: true,
            avatar: true,
          },
        },
        project: {
          select: {
            id: true,
            name: true,
          },
        },
        comments: {
          include: {
            author: {
              select: {
                id: true,
                name: true,
                avatar: true,
              },
            },
          },
          orderBy: {
            createdAt: 'desc',
          },
        },
      },
    })

    if (!issue) {
      return NextResponse.json(
        { error: 'Issue not found' },
        { status: 404 }
      )
    }

    return NextResponse.json({ issue }, { status: 200 })
  } catch (error) {
    console.error('Error fetching issue:', error)
    return NextResponse.json(
      { error: 'Failed to fetch issue' },
      { status: 500 }
    )
  }
}

// PATCH /api/issues/[id] - Update an issue
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json()
    const {
      title,
      description,
      status,
      priority,
      type,
      assigneeId,
      resolvedAt,
    } = body

    const updateData: any = {}
    if (title !== undefined) updateData.title = title
    if (description !== undefined) updateData.description = description
    if (status !== undefined) {
      updateData.status = status
      // If status is Resolved or Closed, set resolvedAt
      if ((status === 'Resolved' || status === 'Closed') && !resolvedAt) {
        updateData.resolvedAt = new Date()
      }
    }
    if (priority !== undefined) updateData.priority = priority
    if (type !== undefined) updateData.type = type
    if (assigneeId !== undefined) updateData.assigneeId = assigneeId
    if (resolvedAt !== undefined) updateData.resolvedAt = resolvedAt ? new Date(resolvedAt) : null

    const issue = await prisma.issue.update({
      where: { id },
      data: updateData,
      include: {
        assignee: {
          select: {
            name: true,
            email: true,
          },
        },
      },
    })

    return NextResponse.json({ issue }, { status: 200 })
  } catch (error) {
    console.error('Error updating issue:', error)
    return NextResponse.json(
      { error: 'Failed to update issue' },
      { status: 500 }
    )
  }
}

// DELETE /api/issues/[id] - Delete an issue
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    await prisma.issue.delete({
      where: { id },
    })

    return NextResponse.json(
      { message: 'Issue deleted successfully' },
      { status: 200 }
    )
  } catch (error) {
    console.error('Error deleting issue:', error)
    return NextResponse.json(
      { error: 'Failed to delete issue' },
      { status: 500 }
    )
  }
}

