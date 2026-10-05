'use client'

import { useEffect } from 'react'
import {
  ENTRANCE_SELECTOR,
  ROUTE_TRANSITION_TIMEOUT_MS,
  SHARED_ELEMENT,
  activateSharedProjectHeading,
  applyCinematicTokens,
  createPointerController,
  createRouteTransitionSession,
  effectBudget,
  formatHighlightUnit,
  formatMagneticUnit,
  holdEntranceMotion,
  motionFallback,
  resolveMotionProfile,
  scrollDepth,
  sharedProjectId,
  shouldStartRouteTransition,
  type MotionProfile,
  type SpatialRect,
  type SpatialTarget,
} from '@/components/ui/cinematic-motion'

type ViewDocument = Document & {
  startViewTransition?: (update: () => void | Promise<void>) => { finished: Promise<void> }
}

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

function routeClickInput(event: MouseEvent, anchor: HTMLAnchorElement, profile: MotionProfile) {
  const view = event.view
  if (!view) return null
  let target: URL
  try {
    target = new URL(anchor.href, view.location.href)
  } catch {
    return null
  }
  const doc = view.document as ViewDocument
  return {
    button: event.button,
    metaKey: event.metaKey,
    ctrlKey: event.ctrlKey,
    shiftKey: event.shiftKey,
    altKey: event.altKey,
    profile,
    viewTransitionSupported: typeof doc.startViewTransition === 'function',
    currentOrigin: view.location.origin,
    targetOrigin: target.origin,
    targetPath: target.pathname,
    targetSearch: target.search,
    currentPath: view.location.pathname,
    currentSearch: view.location.search,
    linkTarget: anchor.getAttribute('target'),
    hasDownload: anchor.hasAttribute('download'),
  }
}

function currentLocation(view: Window) {
  return `${view.location.pathname}${view.location.search}`
}

function holdEntrances(doc: Document) {
  for (const node of doc.querySelectorAll(ENTRANCE_SELECTOR)) {
    if (node instanceof HTMLElement) holdEntranceMotion(node)
  }
}

function activateSharedDestination(doc: Document) {
  const heading = doc.getElementById('project-detail-heading')
  if (!(heading instanceof HTMLElement)) return
  if (!activateSharedProjectHeading(doc.documentElement.dataset.sharedProject, heading.dataset.sharedId)) return
  heading.dataset.sharedActive = 'project'
}

function clearShared(doc: Document, root: HTMLElement) {
  delete root.dataset.sharedProject
  for (const node of doc.querySelectorAll('[data-shared-active="project"]')) {
    if (node instanceof HTMLElement) delete node.dataset.sharedActive
  }
}

function armSharedProject(anchor: HTMLAnchorElement, root: HTMLElement) {
  const id = anchor.dataset.sharedElement === 'project' ? sharedProjectId(anchor.dataset.sharedId) : null
  if (!id) return () => {}
  anchor.dataset.sharedActive = 'project'
  root.dataset.sharedProject = id
  root.style.setProperty('--shared-project', SHARED_ELEMENT.project)
  return () => {
    delete anchor.dataset.sharedActive
    delete root.dataset.sharedProject
  }
}

function armPathChange(view: Window, destination: string, finish: () => void) {
  const doc = view.document
  let settled = false
  let frame = 0
  const complete = () => {
    if (settled) return
    settled = true
    observer.disconnect()
    view.clearTimeout(timer)
    if (frame) view.cancelAnimationFrame(frame)
    finish()
  }
  const observer = new MutationObserver(() => {
    if (currentLocation(view) !== destination) return
    activateSharedDestination(doc)
    if (frame) return
    frame = view.requestAnimationFrame(() => complete())
  })
  observer.observe(doc.body, { childList: true, subtree: true })
  const timer = view.setTimeout(complete, ROUTE_TRANSITION_TIMEOUT_MS)
  return complete
}

/** One listener set for pointer physics and desktop route continuity. Renders nothing. */
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
    let finishRoute = () => {}
    const doc = document as ViewDocument
    applyCinematicTokens((name, value) => root.style.setProperty(name, value))
    const routes = createRouteTransitionSession((update) => {
      if (!doc.startViewTransition) throw new Error('View Transition API is unavailable')
      return doc.startViewTransition(update)
    })

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
    const settleRoute = () => {
      finishRoute = () => {}
      holdEntrances(document)
      delete root.dataset.routeTransition
      clearShared(document, root)
    }
    const onClick = (event: MouseEvent) => {
      if (!(event.target instanceof Element)) return
      const anchor = event.target.closest('a[href]')
      if (!(anchor instanceof HTMLAnchorElement)) return
      const profile = readProfile(view)
      const input = routeClickInput(event, anchor, profile)
      if (!input || motionFallback(input.viewTransitionSupported, profile) !== 'view-transition') return
      if (!shouldStartRouteTransition(input) || !doc.startViewTransition || routes.isPending()) return
      const destination = `${input.targetPath}${input.targetSearch}`
      const releaseShared = armSharedProject(anchor, root)
      root.dataset.routeTransition = 'view'
      const started = routes.begin(
        (finish) => {
          finishRoute = finish
          return armPathChange(view, destination, finish)
        },
        settleRoute,
      )
      if (!started) {
        releaseShared()
        delete root.dataset.routeTransition
      }
    }
    const onPopState = () => {
      finishRoute()
      delete root.dataset.routeTransition
      clearShared(document, root)
    }
    const onScroll = (event: Event) => {
      const target = event.target
      if (!(target instanceof Element) || target.tagName !== 'MAIN') return
      const next = scrollDepth(target.scrollTop)
      if (root.dataset.scrollDepth !== next) root.dataset.scrollDepth = next
    }

    for (const query of queries) query.addEventListener('change', syncProfile)
    view.addEventListener('resize', syncProfile)
    view.addEventListener('click', onClick, true)
    view.addEventListener('popstate', onPopState)
    document.addEventListener('scroll', onScroll, true)
    syncProfile()

    return () => {
      finishRoute()
      for (const query of queries) query.removeEventListener('change', syncProfile)
      view.removeEventListener('resize', syncProfile)
      view.removeEventListener('click', onClick, true)
      view.removeEventListener('popstate', onPopState)
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
