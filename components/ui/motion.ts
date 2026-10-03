/** Shared timing values for CSS motion and JavaScript-driven visualizations. */
export const MOTION_DURATION_MS = Object.freeze({
  instant: 100,
  fast: 160,
  standard: 260,
  slow: 420,
  page: 180,
  overlay: 190,
  chart: 340,
  skeleton: 1200,
  staggerStep: 24,
})

export const MOTION_EASING = Object.freeze({
  standard: 'cubic-bezier(0.2, 0, 0, 1)',
  enter: 'cubic-bezier(0.16, 1, 0.3, 1)',
  exit: 'cubic-bezier(0.4, 0, 1, 1)',
  spring: 'cubic-bezier(0.2, 0.8, 0.2, 1)',
})

export const MOTION_CLASS = Object.freeze({
  pageEnter: 'motion-page-enter',
  contentEnter: 'motion-content-enter',
  valueChange: 'motion-value-change',
  stagger: 'motion-stagger',
  control: 'motion-control',
  card: 'motion-card',
})
