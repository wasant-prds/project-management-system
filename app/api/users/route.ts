import { NextResponse } from 'next/server'
import { getOwner, ownerErrorResponse, ownerProfile } from '@/lib/owner'

// GET /api/users - Return only the authenticated owner for legacy consumers.
export async function GET() {
    try {
        const owner = await getOwner()
        const users = [ownerProfile(owner)]

        return NextResponse.json({ users }, { status: 200 })
    } catch (error) {
        const ownerError = ownerErrorResponse(error)
        if (ownerError) return ownerError
        console.error('Error fetching users:')
        return NextResponse.json(
            { error: 'Failed to fetch users' },
            { status: 500 }
        )
    }
}

