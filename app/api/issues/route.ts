import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

// GET /api/issues - Get all issues
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const projectId = searchParams.get('projectId')
    const assigneeId = searchParams.get('assigneeId')
    const status = searchParams.get('status')
    const type = searchParams.get('type')

    const where: any = {}
    if (projectId) where.projectId = projectId
    if (assigneeId) where.assigneeId = assigneeId
    if (status) where.status = status
    if (type) where.type = type

    const issues = await prisma.issue.findMany({
      where,
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
        _count: {
          select: {
            comments: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    })

    return NextResponse.json({ issues }, { status: 200 })
  } catch (error) {
    console.error('Error fetching issues:', error)
    return NextResponse.json(
      { error: 'Failed to fetch issues' },
      { status: 500 }
    )
  }
}

// POST /api/issues - Create a new issue
export async function POST(request: Request) {
  try {
    const body = await request.json()
    const {
      title,
      description,
      status,
      priority,
      type,
      projectId,
      reporterId,
      assigneeId,
    } = body

    // Validate required fields
    if (!title || !projectId) {
      return NextResponse.json(
        { error: 'Title and project ID are required' },
        { status: 400 }
      )
    }

    const issue = await prisma.issue.create({
      data: {
        title,
        description,
        status: status || 'Open',
        priority: priority || 'Medium',
        type: type || 'Bug',
        projectId,
        reporterId,
        assigneeId,
      },
      include: {
        reporter: {
          select: {
            name: true,
            email: true,
          },
        },
        assignee: {
          select: {
            name: true,
            email: true,
          },
        },
        project: {
          select: {
            name: true,
          },
        },
      },
    })

    return NextResponse.json({ issue }, { status: 201 })
  } catch (error) {
    console.error('Error creating issue:', error)
    return NextResponse.json(
      { error: 'Failed to create issue' },
      { status: 500 }
    )
  }
}

