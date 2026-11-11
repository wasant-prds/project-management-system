/** Shared interaction decisions, independent of React and the DOM. */

export const SPATIAL_LEVEL = Object.freeze({
  background: 0,
  base: 1,
  raised: 2,
  interactive: 3,
  floating: 4,
  overlay: 5,
  modal: 6,
})

export const SCROLL_RAISED_PX = 12

const MAGNETIC_MAX_PX = 4

export type MotionProfile = 'reduced' | 'touch' | 'tablet' | 'desktop'

export type EffectBudget = {
  pointer: boolean
  magnetic: boolean
  blur: boolean
}

export type SpatialRect = {
  left: number
  top: number
  width: number
  height: number
}

export type SpatialTarget = {
  mode: 'pointer' | 'magnetic'
  disabled: () => boolean
  setPointer: (x: number, y: number) => void
  setMagnetic: (x: number, y: number) => void
  clear: () => void
}

export type PointerSample = {
  clientX: number
  clientY: number
  target: SpatialTarget | null
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function rounded(value: number) {
  return Math.round(value * 100) / 100
}

export function resolveMotionProfile(input: {
  reducedMotion: boolean
  finePointer: boolean
  hoverCapable: boolean
  viewportWidth: number
}): MotionProfile {
  if (input.reducedMotion) return 'reduced'
  if (!input.finePointer || !input.hoverCapable || !Number.isFinite(input.viewportWidth) || input.viewportWidth < 640) {
    return 'touch'
  }
  if (input.viewportWidth < 1024) return 'tablet'
  return 'desktop'
}

export function effectBudget(profile: MotionProfile): EffectBudget {
  if (profile === 'desktop') {
    return { pointer: true, magnetic: true, blur: false }
  }
  if (profile === 'tablet') {
    return { pointer: false, magnetic: false, blur: false }
  }
  if (profile === 'touch') {
    return { pointer: false, magnetic: false, blur: false }
  }
  return { pointer: false, magnetic: false, blur: false }
}

export function scrollDepth(scrollTop: number): 'raised' | 'rest' {
  if (!Number.isFinite(scrollTop) || scrollTop <= SCROLL_RAISED_PX) return 'rest'
  return 'raised'
}

export function metricDirection(from: number, to: number): 'rise' | 'fall' | 'steady' {
  if (!Number.isFinite(from) || !Number.isFinite(to) || from === to) return 'steady'
  if (to > from) return 'rise'
  return 'fall'
}

export function progressShiftPercent(value: number) {
  if (!Number.isFinite(value)) return 100
  return rounded(100 - clamp(value, 0, 100))
}

export function kpiMarker(emphasis: 'primary' | 'support' | undefined): 'kpi-primary' | 'kpi' {
  if (emphasis === 'primary') return 'kpi-primary'
  return 'kpi'
}

export function magneticControlKind(enabled: boolean | null | undefined): 'magnetic' | undefined {
  return enabled ? 'magnetic' : undefined
}

export function pointerHighlightPosition(clientX: number, clientY: number, rect: SpatialRect) {
  if (!Number.isFinite(clientX) || !Number.isFinite(clientY) || rect.width <= 0 || rect.height <= 0) {
    return { x: 50, y: 40 }
  }
  return {
    x: rounded(clamp(((clientX - rect.left) / rect.width) * 100, 0, 100)),
    y: rounded(clamp(((clientY - rect.top) / rect.height) * 100, 0, 100)),
  }
}

function canUseMagnetic(clientX: number, clientY: number, rect: SpatialRect, maxPx: number) {
  if (!Number.isFinite(clientX) || !Number.isFinite(clientY) || !Number.isFinite(maxPx)) return false
  if (maxPx <= 0 || rect.width <= 0 || rect.height <= 0) return false
  return true
}

export function magneticOffset(clientX: number, clientY: number, rect: SpatialRect, maxPx = MAGNETIC_MAX_PX) {
  if (!canUseMagnetic(clientX, clientY, rect, maxPx)) return { x: 0, y: 0 }
  const deltaX = clientX - (rect.left + rect.width / 2)
  const deltaY = clientY - (rect.top + rect.height / 2)
  const distance = Math.hypot(deltaX, deltaY)
  const radius = Math.max(rect.width, rect.height) * 0.9
  if (distance === 0 || distance > radius) return { x: 0, y: 0 }
  const strength = (1 - distance / radius) * maxPx
  return {
    x: rounded(clamp((deltaX / distance) * strength, -maxPx, maxPx)),
    y: rounded(clamp((deltaY / distance) * strength, -maxPx, maxPx)),
  }
}

export function formatHighlightUnit(value: number) {
  return `${rounded(value)}%`
}

export function formatMagneticUnit(value: number) {
  return `${rounded(value)}px`
}

export function createPointerController(
  schedule: (flush: () => void) => number,
  cancel: (id: number) => void,
  readRect: (target: SpatialTarget) => SpatialRect | null,
) {
  let frame: number | null = null
  let pending: PointerSample | null = null
  let active: SpatialTarget | null = null

  const apply = () => {
    frame = null
    const sample = pending
    pending = null
    if (!sample) return
    if (active && active !== sample.target) active.clear()
    if (!sample.target || sample.target.disabled()) {
      sample.target?.clear()
      active = null
      return
    }
    const rect = readRect(sample.target)
    active = sample.target
    if (!rect) return
    if (sample.target.mode === 'pointer') {
      const point = pointerHighlightPosition(sample.clientX, sample.clientY, rect)
      sample.target.setPointer(point.x, point.y)
      return
    }
    const offset = magneticOffset(sample.clientX, sample.clientY, rect)
    sample.target.setMagnetic(offset.x, offset.y)
  }

  return {
    push(sample: PointerSample) {
      pending = sample
      if (frame !== null) return
      frame = schedule(apply)
    },
    releaseMagnetic() {
      if (active?.mode === 'magnetic') active.setMagnetic(0, 0)
    },
    reset() {
      pending = null
      if (frame !== null) {
        cancel(frame)
        frame = null
      }
      if (active) active.clear()
      active = null
    },
  }
}
