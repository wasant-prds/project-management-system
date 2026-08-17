'use client'

import { useEffect, useRef, type ReactNode } from 'react'
import { cn } from '@/lib/utils'

type ScrollablePanelProps = {
  className?: string
  children: ReactNode
}

export function ScrollablePanel({ className, children }: Readonly<ScrollablePanelProps>) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const panel = ref.current
    if (!panel) return

    const onWheel = (event: WheelEvent) => {
      if (panel.scrollHeight <= panel.clientHeight + 1) return
      event.preventDefault()
      event.stopPropagation()
      panel.scrollTop += event.deltaY
    }

    panel.addEventListener('wheel', onWheel, { capture: true, passive: false })
    return () => panel.removeEventListener('wheel', onWheel, { capture: true })
  }, [])

  return (
    <div
      ref={ref}
      data-scrollable-panel=""
      className={cn(
        'min-h-0 overflow-y-auto overscroll-contain outline-none',
        className,
      )}
    >
      {children}
    </div>
  )
}
