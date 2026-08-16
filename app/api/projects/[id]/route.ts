import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { serializeWorkItemStatus } from '@/lib/work-items'

// GET /api/projects/[id] - Get a single project
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const project = await prisma.project.findUnique({
      where: { id },
      include: {
        creator: {
          select: {
            name: true,
            email: true,
            avatar: true,
          },
        },
        members: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
                avatar: true,
              },
            },
          },
        },
        workItems: {
          include: {
            assignee: {
              select: {
                name: true,
                avatar: true,
              },
            },
          },
          orderBy: {
            createdAt: 'desc',
          },
        },
        milestones: {
          orderBy: {
            dueDate: 'asc',
          },
        },
      },
    })

    if (!project) {
      return NextResponse.json(
        { error: 'Project not found' },
        { status: 404 }
      )
    }

    return NextResponse.json({
      project: {
        ...project,
        workItems: project.workItems.map((item) => ({
          ...item,
          status: serializeWorkItemStatus(item.status),
        })),
      },
    }, { status: 200 })
  } catch (error) {
    console.error('Error fetching project:', error)
    return NextResponse.json(
      { error: 'Failed to fetch project' },
      { status: 500 }
    )
  }
}

// PATCH /api/projects/[id] - Update a project
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json()
    const {
      name,
      description,
      status,
      priority,
      startDate,
      dueDate,
      budget,
      spent,
      progress,
    } = body

    const updateData: Record<string, unknown> = {}
    if (name !== undefined) updateData.name = name
    if (description !== undefined) updateData.description = description
    if (status !== undefined) updateData.status = status
    if (priority !== undefined) updateData.priority = priority
    if (startDate !== undefined) updateData.startDate = new Date(startDate)
    if (dueDate !== undefined) updateData.dueDate = new Date(dueDate)
    if (budget !== undefined) updateData.budget = parseFloat(budget)
    if (spent !== undefined) updateData.spent = parseFloat(spent)
    if (progress !== undefined) updateData.progress = parseInt(progress)

    const project = await prisma.project.update({
      where: { id },
      data: updateData,
      include: {
        creator: {
          select: {
            name: true,
            email: true,
          },
        },
      },
    })

    return NextResponse.json({ project }, { status: 200 })
  } catch (error) {
    console.error('Error updating project:', error)
    return NextResponse.json(
      { error: 'Failed to update project' },
      { status: 500 }
    )
  }
}

// DELETE /api/projects/[id] - Delete a project
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    await prisma.project.delete({
      where: { id },
    })

    return NextResponse.json(
      { message: 'Project deleted successfully' },
      { status: 200 }
    )
  } catch (error) {
    console.error('Error deleting project:', error)
    return NextResponse.json(
      { error: 'Failed to delete project' },
      { status: 500 }
    )
  }
}
