import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

// GET /api/users - Get all users
export async function GET() {
    try {
        const users = await prisma.user.findMany({
            select: {
                id: true,
                name: true,
                email: true,
                role: true,
                avatar: true,
                status: true,
            },
            where: {
                status: 'Active',
            },
            orderBy: {
                name: 'asc',
            },
        })

        return NextResponse.json({ users }, { status: 200 })
    } catch (error) {
        console.error('Error fetching users:', error)
        return NextResponse.json(
            { error: 'Failed to fetch users' },
            { status: 500 }
        )
    }
}

