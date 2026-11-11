'use client'

import { useEffect } from 'react'
import {
  createPointerController,
  effectBudget,
  formatHighlightUnit,
  formatMagneticUnit,
  resolveMotionProfile,
  scrollDepth,
  type MotionProfile,
  type SpatialRect,
  type SpatialTarget,
} from '@/components/ui/cinematic-motion'

function readProfile(view: Window): MotionProfile {
  return resolveMotionProfile({
    reducedMotion: view.matchMedia('(prefers-reduced-motion: reduce)').matches,
    finePointer: view.matchMedia('(pointer: fine)').matches,
    hoverCapable: view.matchMedia('(hover: hover)').matches,
    viewportWidth: view.innerWidth,
  })
}

function isDisabledControl(element: HTMLElement) {
  if (element.matches(':disabled, [aria-disabled="true"]')) return true
  const field = element.closest('button, a, input, select, textarea')
  if (!(field instanceof HTMLElement)) return false
  return field.matches(':disabled, [aria-disabled="true"]')
}

function spatialElement(target: EventTarget | null) {
  if (!(target instanceof Element)) return null
  return target.closest<HTMLElement>('[data-spatial="pointer"], [data-spatial="magnetic"]')
}

function createAdapter(element: HTMLElement, cache: WeakMap<HTMLElement, SpatialTarget>): SpatialTarget {
  const existing = cache.get(element)
  if (existing) return existing
  const adapter: SpatialTarget = {
    mode: element.dataset.spatial === 'magnetic' ? 'magnetic' : 'pointer',
    disabled: () => isDisabledControl(element),
    setPointer: (x, y) => {
      element.style.setProperty('--spatial-x', formatHighlightUnit(x))
      element.style.setProperty('--spatial-y', formatHighlightUnit(y))
    },
    setMagnetic: (x, y) => {
      element.style.setProperty('--magnetic-x', formatMagneticUnit(x))
      element.style.setProperty('--magnetic-y', formatMagneticUnit(y))
    },
    clear: () => {
      element.style.removeProperty('--spatial-x')
      element.style.removeProperty('--spatial-y')
      element.style.removeProperty('--magnetic-x')
      element.style.removeProperty('--magnetic-y')
    },
  }
  cache.set(element, adapter)
  return adapter
}

/** Interaction feedback only. CSS owns route motion; navigation never pauses painting. */
export function CinematicRuntime() {
  useEffect(() => {
    const view = window
    const root = document.documentElement
    const cache = new WeakMap<HTMLElement, SpatialTarget>()
    const rects = new WeakMap<SpatialTarget, HTMLElement>()
    const readRect = (target: SpatialTarget): SpatialRect | null => {
      const element = rects.get(target)
      if (!element?.isConnected) return null
      const rect = element.getBoundingClientRect()
      return { left: rect.left, top: rect.top, width: rect.width, height: rect.height }
    }
    const pointer = createPointerController(
      (flush) => view.requestAnimationFrame(flush),
      (id) => view.cancelAnimationFrame(id),
      readRect,
    )
    const queries = [
      view.matchMedia('(prefers-reduced-motion: reduce)'),
      view.matchMedia('(pointer: fine)'),
      view.matchMedia('(hover: hover)'),
    ]
    let listening = false
    const onPointer = (event: PointerEvent) => {
      const element = spatialElement(event.target)
      const target = element ? createAdapter(element, cache) : null
      if (element && target) rects.set(target, element)
      pointer.push({ clientX: event.clientX, clientY: event.clientY, target })
    }
    const onPressure = () => pointer.releaseMagnetic()
    const onLeave = () => pointer.reset()
    const syncProfile = () => {
      const profile = readProfile(view)
      root.dataset.motionProfile = profile
      const budget = effectBudget(profile)
      const wantsPointer = budget.pointer || budget.magnetic
      if (wantsPointer && !listening) {
        view.addEventListener('pointermove', onPointer, { passive: true })
        view.addEventListener('pointerdown', onPressure, true)
        view.addEventListener('blur', onLeave)
        listening = true
        return
      }
      if (!wantsPointer && listening) {
        view.removeEventListener('pointermove', onPointer)
        view.removeEventListener('pointerdown', onPressure, true)
        view.removeEventListener('blur', onLeave)
        pointer.reset()
        listening = false
      }
    }
    const onScroll = (event: Event) => {
      const target = event.target
      if (!(target instanceof Element) || target.tagName !== 'MAIN') return
      const next = scrollDepth(target.scrollTop)
      if (root.dataset.scrollDepth !== next) root.dataset.scrollDepth = next
    }

    for (const query of queries) query.addEventListener('change', syncProfile)
    view.addEventListener('resize', syncProfile)
    document.addEventListener('scroll', onScroll, true)
    syncProfile()

    return () => {
      for (const query of queries) query.removeEventListener('change', syncProfile)
      view.removeEventListener('resize', syncProfile)
      document.removeEventListener('scroll', onScroll, true)
      if (listening) {
        view.removeEventListener('pointermove', onPointer)
        view.removeEventListener('pointerdown', onPressure, true)
        view.removeEventListener('blur', onLeave)
      }
      pointer.reset()
    }
  }, [])

  return null
}
