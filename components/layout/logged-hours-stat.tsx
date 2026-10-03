'use client'

import { useEffect, useState } from 'react'
import { Clock } from 'lucide-react'
import { SummaryStatCard } from '@/components/layout/summary-stat-card'

type LoggedHoursStatProps = {
  label: string
  startDate?: string
  endDate?: string
}

type StatState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; hours: string }

function summaryUrl(startDate?: string, endDate?: string) {
  if (!startDate || !endDate) return '/api/work-logs/summary'
  const params = new URLSearchParams({ startDate, endDate })
  return `/api/work-logs/summary?${params.toString()}`
}

export function LoggedHoursStat({ label, startDate, endDate }: Readonly<LoggedHoursStatProps>) {
  const [state, setState] = useState<StatState>({ status: 'loading' })
  const url = summaryUrl(startDate, endDate)

  useEffect(() => {
    let active = true
    const load = async () => {
      try {
        const response = await fetch(url, { cache: 'no-store' })
        if (!response.ok) throw new Error('Request failed')
        const payload: unknown = await response.json()
        if (typeof payload !== 'object' || payload === null || !('summary' in payload)) {
          throw new Error('Invalid summary response')
        }
        const summary = payload.summary
        if (typeof summary !== 'object' || summary === null || !('hours' in summary) || typeof summary.hours !== 'string') {
          throw new Error('Invalid summary response')
        }
        if (active) setState({ status: 'ready', hours: summary.hours })
      } catch {
        if (active) setState({ status: 'error' })
      }
    }

    load().catch(() => {
      if (active) setState({ status: 'error' })
    })
    return () => { active = false }
  }, [url])

  let value = '—'
  if (state.status === 'ready') value = state.hours
  if (state.status === 'loading') value = '…'

  let hint = 'ชั่วโมงรวมทั้งหมด'
  if (state.status === 'error') hint = 'โหลดชั่วโมงไม่สำเร็จ'
  else if (startDate && endDate) hint = 'ชั่วโมงรวมตามช่วงวันที่ Asia/Bangkok'

  return (
    <SummaryStatCard
      label={label}
      value={<output aria-label={`${label}: ${value}`}>{value}</output>}
      icon={<Clock className="h-4 w-4 text-info" />}
      hint={<span className="text-sm text-muted-foreground">{hint}</span>}
    />
  )
}
