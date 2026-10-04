'use client'

import { useReportWebVitals } from 'next/web-vitals'
import { publishPerformanceMetric } from '@/lib/performance-metrics'

// No network, persistent storage or third-party collector.
export function PerformanceMetrics() {
  useReportWebVitals(publishPerformanceMetric)
  return null
}
