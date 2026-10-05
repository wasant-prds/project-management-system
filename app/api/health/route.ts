import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

// Health check endpoint for Docker and monitoring
export async function GET() {
  const timestamp = new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Bangkok' }).replace(' ', 'T') + '+07:00'
  try {
    // Check database connection
    const rows = await prisma.$queryRaw<Array<{ timezone: string }>>`SELECT current_setting('TimeZone') AS timezone`
    if (rows[0]?.timezone !== 'Asia/Bangkok') throw new Error('Invalid database timezone')
    const revisions = await prisma.$queryRaw<Array<{ ready: boolean }>>`
      SELECT EXISTS (
        SELECT 1 FROM "schema_migrations"
        WHERE "version" = '0001' AND "status" = 'applied' AND "schema_revision" LIKE '31.%'
      ) AS ready
    `
    if (revisions[0]?.ready !== true) throw new Error('Schema revision is not compatible')

    return NextResponse.json(
      {
        status: 'healthy',
        timestamp,
        database: 'connected',
        uptime: process.uptime(),
      },
      { status: 200 }
    )
  } catch {
    console.error('Health check failed:')
    
    return NextResponse.json(
      {
        status: 'unhealthy',
        timestamp,
        database: 'disconnected',
      },
      { status: 503 }
    )
  }
}

