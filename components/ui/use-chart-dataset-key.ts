'use client'

import { useRef } from 'react'
import { shouldRestartChartMotion } from '@/components/ui/product-identity'

export function useChartDatasetKey(datasetKey: string) {
  const applied = useRef(datasetKey)
  if (shouldRestartChartMotion(applied.current, datasetKey, 'dataset')) applied.current = datasetKey
  return applied.current
}
