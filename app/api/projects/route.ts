import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

// GET /api/projects - Get all projects
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status')

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
    console.error('Error fetching projects:', error)
    return NextResponse.json(
      { error: 'Failed to fetch projects' },
      { status: 500 }
    )
  }
}

// POST /api/projects - Create a new project
export async function POST(request: Request) {
  try {
    const body = await request.json()
    const {
      name,
      description,
      status,
      priority,
      startDate,
      dueDate,
      budget,
      creatorId,
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
        creatorId,
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
    console.error('Error creating project:', error)
    return NextResponse.json(
      { error: 'Failed to create project' },
      { status: 500 }
    )
  }
}
