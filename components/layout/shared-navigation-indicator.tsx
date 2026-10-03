'use client'

import { useEffect, useRef } from 'react'
import { observeNavigationIndicator } from './navigation-motion'

/** Mount inside the navigation so lazy mobile portals get their own lifecycle. */
export function SharedNavigationIndicator({ pathname }: Readonly<{ pathname: string }>) {
  const indicatorRef = useRef<HTMLSpanElement | null>(null)

  useEffect(() => {
    const indicator = indicatorRef.current
    const navigation = indicator?.parentElement
    if (!indicator || !navigation) return
    return observeNavigationIndicator(navigation, indicator)
  }, [pathname])

  return <span ref={indicatorRef} aria-hidden="true" data-slot="shared-navigation-indicator" className="motion-shared-nav-indicator" />
}
