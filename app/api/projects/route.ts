import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getOwner, ownerErrorResponse } from '@/lib/owner'

// GET /api/projects - Get all projects
export async function GET(request: Request) {
  try {
    await getOwner()
    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status')

    if (searchParams.get('options') === 'work-items') {
      const projects = await prisma.project.findMany({
        select: {
          id: true,
          name: true,
          colorProject: true,
        },
        orderBy: {
          createdAt: 'desc',
        },
      })

      return NextResponse.json({ projects }, { status: 200 })
    }

    const where = status ? { status } : {}

    const projects = await prisma.project.findMany({
      where,
      include: {
        _count: {
          select: {
            workItems: true,
            members: true,
          },
        },
        creator: {
          select: {
            name: true,
            email: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    })

    return NextResponse.json({ projects }, { status: 200 })
  } catch (error) {
    const ownerError = ownerErrorResponse(error)
    if (ownerError) return ownerError
    console.error('Error fetching projects:')
    return NextResponse.json(
      { error: 'Failed to fetch projects' },
      { status: 500 }
    )
  }
}

// POST /api/projects - Create a new project
export async function POST(request: Request) {
  try {
    const owner = await getOwner()
    const body = await request.json()
    const {
      name,
      description,
      status,
      priority,
      startDate,
      dueDate,
      budget,
    } = body

    // Validate required fields
    if (!name || !startDate || !dueDate) {
      return NextResponse.json(
        { error: 'Name, start date, and due date are required' },
        { status: 400 }
      )
    }

    const project = await prisma.project.create({
      data: {
        name,
        description,
        status: status || 'Planning',
        priority: priority || 'Medium',
        startDate: new Date(startDate),
        dueDate: new Date(dueDate),
        budget: budget ? parseFloat(budget) : null,
        creatorId: owner.id,
      },
      include: {
        creator: {
          select: {
            name: true,
            email: true,
          },
        },
      },
    })

    return NextResponse.json({ project }, { status: 201 })
  } catch (error) {
    const ownerError = ownerErrorResponse(error)
    if (ownerError) return ownerError
    console.error('Error creating project:')
    return NextResponse.json(
      { error: 'Failed to create project' },
      { status: 500 }
    )
  }
}
