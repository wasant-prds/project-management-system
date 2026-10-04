/** Coalesce native scroll/resize bursts and finish geometry reads before React updates. */
export function observeStickyHeader(
  header: HTMLElement,
  root: HTMLElement | null,
  offsetPx: number,
  onMeasure: (height: number, stuck: boolean) => void,
) {
  const view = header.ownerDocument.defaultView
  if (!view) return () => {}
  let frame: number | null = null

  const measure = () => {
    const rect = header.getBoundingClientRect()
    const rootTop = root?.getBoundingClientRect().top
    const paddingTop = root ? Number.parseFloat(view.getComputedStyle(root).paddingTop) || 0 : 0
    onMeasure(rect.height, rootTop !== undefined && rect.top <= rootTop + paddingTop + offsetPx + 1)
  }
  const schedule = () => {
    if (frame !== null) return
    frame = view.requestAnimationFrame(() => {
      frame = null
      measure()
    })
  }

  const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(schedule)
  observer?.observe(header)
  if (root) observer?.observe(root)
  measure()
  root?.addEventListener('scroll', schedule, { passive: true })
  view.addEventListener('resize', schedule)

  return () => {
    if (frame !== null) view.cancelAnimationFrame(frame)
    observer?.disconnect()
    root?.removeEventListener('scroll', schedule)
    view.removeEventListener('resize', schedule)
  }
}
