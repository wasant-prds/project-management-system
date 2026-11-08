import { NextResponse } from 'next/server'
import { database } from '@/lib/database/client'
import { sql } from '@/lib/database/sql'

// Health check endpoint for Docker and monitoring
export async function GET() {
  const timestamp =
    new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Bangkok' }).replace(' ', 'T') + '+07:00'
  try {
    const ready = await database.one<{ ready: boolean }>(sql`
      SELECT current_setting('TimeZone')='Asia/Bangkok'
        AND to_regclass('public.issue_sync_configs') IS NOT NULL
        AND EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='issue_sync_configs' AND column_name='token_env_var')
        AND EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='work_items' AND column_name='id' AND data_type='bigint')
        AND EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='work_items' AND column_name='public_id' AND data_type='uuid') AS ready`)
    if (!ready?.ready) throw new Error('Database schema is not ready')

    return NextResponse.json(
      {
        status: 'healthy',
        timestamp,
        database: 'connected',
        uptime: process.uptime(),
      },
      { status: 200 },
    )
  } catch {
    console.error('Health check failed:')

    return NextResponse.json(
      {
        status: 'unhealthy',
        timestamp,
        database: 'disconnected',
      },
      { status: 503 },
    )
  }
}
