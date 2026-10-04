'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'

/** Observe the actual scrolling pane; disconnect after activation or unmount. */
export function observeSection(element: Element, activate: () => void) {
  if (typeof IntersectionObserver === 'undefined') {
    activate()
    return () => undefined
  }
  const observer = new IntersectionObserver((entries) => {
    if (entries.some((entry) => entry.isIntersecting)) {
      observer.disconnect()
      activate()
    }
  }, { rootMargin: '240px' })
  observer.observe(element)
  return () => observer.disconnect()
}

/** Keep the section footprint stable; heavy chunks load only near the viewport. */
export function DeferredSection({ children, fallback }: Readonly<{ children: ReactNode; fallback: ReactNode }>) {
  const ref = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    if (!ref.current) return
    return observeSection(ref.current, () => setVisible(true))
  }, [])
  return <div ref={ref} className="min-w-0">{visible ? children : fallback}</div>
}
