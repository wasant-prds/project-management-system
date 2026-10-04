import { useEffect, useRef, useState } from 'react'
import { checkWorkLogLayout } from './work-log-layout-check.mjs'
import { previewData } from './preview-fixtures.mjs'

/** Opt-in preview audit. Measures production DOM; never changes app layout or data. */
export function WorkLogLayoutAudit() {
  const [result, setResult] = useState({ status: 'pending', failures: [] as string[], cards: 0 })
  const previous = useRef('')
  useEffect(() => {
    const root = document.getElementById('root')
    if (!root) return
    const expectedHours = previewData(new URLSearchParams(window.location.search).get('qa')).workLogs.map((log: { hours: string }) => log.hours)
    let frame = 0
    const measure = () => {
      frame = 0
      const cards = Array.from(root.querySelectorAll<HTMLElement>('[data-work-log-card]')).map((card) => {
        const header = card.querySelector<HTMLElement>('[data-slot="card-header"]')!
        const title = card.querySelector<HTMLElement>('[data-work-log-identity] [data-slot="card-title"]')!
        const hours = card.querySelector<HTMLElement>('[data-slot="badge"] .tabular-nums')!
        return { titleWidth: title.offsetWidth, titleHeight: title.offsetHeight, headerHeight: header.offsetHeight, cardWidth: card.clientWidth, contentWidth: card.scrollWidth, hours: hours.textContent }
      })
      const next = checkWorkLogLayout(cards, expectedHours)
      const key = JSON.stringify(next)
      if (key !== previous.current) { previous.current = key; setResult(next) }
    }
    const schedule = () => { if (!frame) frame = requestAnimationFrame(measure) }
    const resize = new ResizeObserver(schedule)
    const mutations = new MutationObserver(schedule)
    resize.observe(root)
    mutations.observe(root, { childList: true, subtree: true })
    window.addEventListener('resize', schedule)
    schedule()
    return () => {
      resize.disconnect(); mutations.disconnect(); window.removeEventListener('resize', schedule)
      if (frame) cancelAnimationFrame(frame)
    }
  }, [])
  return <output data-layout-audit={result.status} className="fixed right-2 bottom-2 z-50 max-w-xs rounded-md border bg-card p-2 text-xs text-foreground" aria-live="polite">Daily Work layout {result.status.toUpperCase()} — {result.cards} cards{result.failures.map((failure) => <span className="block" key={failure}>{failure}</span>)}</output>
}
