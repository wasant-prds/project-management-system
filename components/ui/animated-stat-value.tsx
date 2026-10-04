'use client'

import { useEffect, useRef } from 'react'
import { usePrefersReducedMotion } from '@/hooks/use-prefers-reduced-motion'
import { MOTION_CLASS } from './motion'
import { tweenMetric } from './metric-motion'

export function AnimatedStatValue({ value }: Readonly<{ value: number }>) {
  const element = useRef<HTMLSpanElement>(null)
  const displayed = useRef(value)
  const reducedMotion = usePrefersReducedMotion()

  useEffect(() => {
    const node = element.current
    const view = node?.ownerDocument.defaultView
    if (!node || !view) return
    const write = (next: number) => {
      displayed.current = next
      node.textContent = String(next)
    }
    if (reducedMotion) {
      write(value)
      return
    }
    return tweenMetric(displayed.current, value, view, write)
  }, [value, reducedMotion])

  // SSR and first hydration expose the exact count; only subsequent changes interpolate.
  return (
    <span data-slot="animated-stat-value" className={MOTION_CLASS.valueChange}>
      <span ref={element} aria-hidden="true">{value}</span>
      <span className="sr-only">{value}</span>
    </span>
  )
}
