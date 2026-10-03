import Link from 'next/link'

type HoursChartDotProps = {
  cx?: number
  cy?: number
  r?: number
  payload?: { startDate: string; href: string; accessibleName: string }
}

/** Recharts calls this factory for every point; the returned SVG link needs its own stable key. */
export function renderHoursChartDot({ cx, cy, r = 4, payload }: HoursChartDotProps) {
  if (!payload) return <g />
  return (
    <Link key={payload.startDate} href={payload.href} aria-label={payload.accessibleName}>
      <circle cx={cx} cy={cy} r={r} fill="var(--chart-2)" stroke="var(--background)" strokeWidth={2} />
    </Link>
  )
}
