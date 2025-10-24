import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

// GET /api/work-logs/[id] - Get a single work log
export async function GET(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params
        const workLog = await prisma.timeEntry.findUnique({
            where: { id },
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

        if (!workLog) {
            return NextResponse.json(
                { error: 'Work log not found' },
                { status: 404 }
            )
        }

        return NextResponse.json({ workLog }, { status: 200 })
    } catch (error) {
        console.error('Error fetching work log:', error)
        return NextResponse.json(
            { error: 'Failed to fetch work log' },
            { status: 500 }
        )
    }
}

// PATCH /api/work-logs/[id] - Update a work log
export async function PATCH(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params
        const body = await request.json()
        const {
            description,
            remarks,
            hours,
            date,
            taskId,
            projectId,
            status,
        } = body

        const updateData: any = {}
        if (description !== undefined) updateData.description = description
        if (remarks !== undefined) updateData.remarks = remarks
        if (hours !== undefined) updateData.hours = Number.parseFloat(hours)
        if (date !== undefined) updateData.date = new Date(date)
        if (taskId !== undefined) updateData.taskId = taskId
        if (projectId !== undefined) updateData.projectId = projectId
        if (status !== undefined) updateData.status = status

        const workLog = await prisma.timeEntry.update({
            where: { id },
            data: updateData,
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

        return NextResponse.json({ workLog }, { status: 200 })
    } catch (error) {
        console.error('Error updating work log:', error)
        return NextResponse.json(
            { error: 'Failed to update work log' },
            { status: 500 }
        )
    }
}

// DELETE /api/work-logs/[id] - Delete a work log
export async function DELETE(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params
        await prisma.timeEntry.delete({
            where: { id },
        })

        return NextResponse.json(
            { message: 'Work log deleted successfully' },
            { status: 200 }
        )
    } catch (error) {
        console.error('Error deleting work log:', error)
        return NextResponse.json(
            { error: 'Failed to delete work log' },
            { status: 500 }
        )
    }
}

