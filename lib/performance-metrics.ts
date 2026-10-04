type Metric = { name: string; value: number; rating: string }

/** Local events exclude query strings, metric IDs and Project IDs. */
export function publishPerformanceMetric(metric: Metric) {
  if (!['LCP', 'INP', 'CLS', 'FCP', 'TTFB'].includes(metric.name) || !Number.isFinite(metric.value)) return
  const pathname = window.location.pathname
  const route = pathname.startsWith('/projects/') ? '/projects/[id]' : pathname
  window.dispatchEvent(new CustomEvent('pms:performance', { detail: {
    name: metric.name, value: metric.value, rating: metric.rating, route,
  } }))
}
