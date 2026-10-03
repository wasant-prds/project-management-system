/** Center the persistent sidebar indicator on its current navigation target. */
export function getSharedNavigationIndicatorOffset(
  navigationTop: number,
  itemTop: number,
  itemHeight: number,
  indicatorHeight = 22,
): number {
  return Math.max(0, itemTop - navigationTop + (itemHeight - indicatorHeight) / 2)
}

/** Measure only once per frame and release every browser subscription on unmount. */
export function observeNavigationIndicator(navigation: HTMLElement, indicator: HTMLSpanElement) {
  const view = navigation.ownerDocument.defaultView
  if (!view) return () => {}

  let frame: number | null = null
  const update = () => {
    if (frame !== null) return
    frame = view.requestAnimationFrame(() => {
      frame = null
      const activeLink = navigation.querySelector<HTMLElement>('[aria-current="page"]')
      if (!activeLink) {
        indicator.style.opacity = '0'
        return
      }
      const navRect = navigation.getBoundingClientRect()
      const linkRect = activeLink.getBoundingClientRect()
      const offset = getSharedNavigationIndicatorOffset(navRect.top, linkRect.top, linkRect.height)
      indicator.style.setProperty('--shared-nav-y', `${offset}px`)
      indicator.style.opacity = '1'
    })
  }

  // The observer also handles fonts and responsive navigation size changes.
  const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(update)
  observer?.observe(navigation)
  view.addEventListener('resize', update)
  update()

  return () => {
    if (frame !== null) view.cancelAnimationFrame(frame)
    observer?.disconnect()
    view.removeEventListener('resize', update)
  }
}
