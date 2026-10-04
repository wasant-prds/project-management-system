import { MOTION_DURATION_MS } from './motion'

type FrameScheduler = Pick<Window, 'requestAnimationFrame' | 'cancelAnimationFrame'>

/** Integer counts only; Decimal hours and formatted values must retain their exact representation. */
export function canTweenMetric(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value)
}

export function tweenMetric(
  from: number,
  to: number,
  scheduler: FrameScheduler,
  write: (value: number) => void,
) {
  if (!canTweenMetric(from) || !canTweenMetric(to) || from === to) {
    write(to)
    return () => {}
  }
  let frame: number | null = null
  let startedAt: number | null = null
  let cancelled = false
  write(from)
  const step = (timestamp: number) => {
    if (cancelled) return
    startedAt ??= timestamp
    const progress = Math.min(1, Math.max(0, (timestamp - startedAt) / MOTION_DURATION_MS.standard))
    const eased = 1 - (1 - progress) ** 3
    write(progress === 1 ? to : Math.round(from * (1 - eased) + to * eased))
    frame = progress < 1 ? scheduler.requestAnimationFrame(step) : null
  }
  frame = scheduler.requestAnimationFrame(step)
  return () => {
    cancelled = true
    if (frame !== null) scheduler.cancelAnimationFrame(frame)
  }
}
