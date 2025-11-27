import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

// GET /api/work-logs - Get all work logs or filter by date/user
export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url)
        const date = searchParams.get('date')
        const startDateParam = searchParams.get('startDate')
        const endDateParam = searchParams.get('endDate')
        const userId = searchParams.get('userId')

        const where: any = {}

        if (date) {
            // Parse date string (yyyy-mm-dd) as local date to avoid timezone issues
            const [year, month, day] = date.split('-').map(Number)
            const startDate = new Date(year, month - 1, day, 0, 0, 0, 0)
            const endDate = new Date(year, month - 1, day, 23, 59, 59, 999)

            where.date = {
                gte: startDate,
                lte: endDate,
            }
        } else if (startDateParam && endDateParam) {
            // Handle date range queries
            const [startYear, startMonth, startDay] = startDateParam.split('-').map(Number)
            const [endYear, endMonth, endDay] = endDateParam.split('-').map(Number)
            
            const startDate = new Date(startYear, startMonth - 1, startDay, 0, 0, 0, 0)
            const endDate = new Date(endYear, endMonth - 1, endDay, 23, 59, 59, 999)

            where.date = {
                gte: startDate,
                lte: endDate,
            }
        }

        if (userId) {
            where.userId = userId
        }

        const workLogs = await prisma.timeEntry.findMany({
            where,
            include: {
                user: {
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
                        colorProject: true,
                    },
                },
                task: {
                    select: {
                        id: true,
                        title: true,
                        status: true,
                        project: {
                            select: {
                                id: true,
                                name: true,
                                colorProject: true,
                            },
                        },
                    },
                },
            },
            orderBy: {
                date: 'desc',
            },
        })

        return NextResponse.json({ workLogs }, { status: 200 })
    } catch (error) {
        console.error('Error fetching work logs:', error)
        return NextResponse.json(
            { error: 'Failed to fetch work logs' },
            { status: 500 }
        )
    }
}

// POST /api/work-logs - Create a new work log
export async function POST(request: Request) {
    try {
        const body = await request.json()
        const {
            description,
            remarks,
            hours,
            date,
            userId,
            taskId,
            projectId,
            status,
        } = body

        console.log('Received work log data:', { description, remarks, hours, date, userId, taskId, projectId, status })

        // Validate required fields
        if (!hours || !userId || !projectId) {
            console.error('Missing required fields:', { hours, userId, projectId })
            return NextResponse.json(
                { error: 'Hours, user ID, and project ID are required' },
                { status: 400 }
            )
        }

        // Check if user exists
        const user = await prisma.user.findUnique({
            where: { id: userId },
        })

        console.log('User lookup result:', user ? `Found: ${user.name}` : 'Not found')

        if (!user) {
            return NextResponse.json(
                { error: `User not found with ID: ${userId}` },
                { status: 404 }
            )
        }

        // Check if task exists (if taskId is provided)
        if (taskId) {
            const task = await prisma.task.findUnique({
                where: { id: taskId },
            })

            if (!task) {
                return NextResponse.json(
                    { error: 'Task not found' },
                    { status: 404 }
                )
            }
        }

        const workLog = await prisma.timeEntry.create({
            data: {
                description,
                remarks,
                hours: Number.parseFloat(hours),
                date: date ? new Date(date) : new Date(),
                userId,
                taskId: taskId || null,
                projectId,
                status,
            },
            include: {
                user: {
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
                        colorProject: true,
                    },
                },
                task: {
                    select: {
                        id: true,
                        title: true,
                        status: true,
                        project: {
                            select: {
                                id: true,
                                name: true,
                                colorProject: true,
                            },
                        },
                    },
                },
            },
        })

        return NextResponse.json({ workLog }, { status: 201 })
    } catch (error) {
        console.error('Error creating work log:', error)
        return NextResponse.json(
            { error: 'Failed to create work log' },
            { status: 500 }
        )
    }
}

