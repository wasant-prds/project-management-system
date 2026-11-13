import { formatHours } from '@/lib/decimal-hours'

/** Axis geometry uses plotted numbers; totals, tables and tooltips keep raw decimal strings. */
export function formatHoursAxisTick(value: number) {
  if (!Number.isFinite(value)) return '—'
  const magnitude = Math.abs(value)
  return magnitude >= 1_000_000 || (magnitude > 0 && magnitude < 0.01)
    ? value.toExponential(1)
    : formatHours(value)
}
