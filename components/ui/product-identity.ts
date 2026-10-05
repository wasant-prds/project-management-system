/** Product visual identity for typography, icons, charts, status and signature patterns. */

export const FONT_STRATEGY = {
  families: ['Geist Sans', 'Geist Mono'],
  primary: 'Geist Sans',
  numeric: 'Geist Sans',
  code: 'Geist Mono',
  maxFamilies: 2,
  variable: true,
  fallbackSans: 'ui-sans-serif, system-ui, sans-serif',
  fallbackMono: 'ui-monospace, SFMono-Regular, Menlo, monospace',
} as const

export const TYPOGRAPHY_ROLES = [
  'display',
  'pageTitle',
  'sectionTitle',
  'cardTitle',
  'kpiHero',
  'kpiSupport',
  'body',
  'label',
  'caption',
  'navigation',
  'button',
  'data',
  'code',
] as const

export type TypographyRole = (typeof TYPOGRAPHY_ROLES)[number]
type TypeColor = 'primary' | 'muted' | 'inherit'

type TypeSpec = {
  className: string
  minRem: number
  maxRem: number
  weight: 400 | 500 | 600
  leading: number
  trackingEm: number
  numeric: boolean
  color: TypeColor
}

export const TYPOGRAPHY: Record<TypographyRole, TypeSpec> = {
  display: { className: 'type-display', minRem: 1.625, maxRem: 2.125, weight: 600, leading: 1.12, trackingEm: -0.04, numeric: false, color: 'primary' },
  pageTitle: { className: 'type-page-title', minRem: 1.375, maxRem: 1.625, weight: 600, leading: 1.15, trackingEm: -0.035, numeric: false, color: 'primary' },
  sectionTitle: { className: 'type-section', minRem: 1.0625, maxRem: 1.25, weight: 600, leading: 1.3, trackingEm: -0.02, numeric: false, color: 'primary' },
  cardTitle: { className: 'type-card-title', minRem: 0.9375, maxRem: 1, weight: 600, leading: 1.35, trackingEm: -0.015, numeric: false, color: 'primary' },
  kpiHero: { className: 'type-kpi-hero', minRem: 1.5, maxRem: 1.875, weight: 600, leading: 1.05, trackingEm: -0.045, numeric: true, color: 'primary' },
  kpiSupport: { className: 'type-kpi-support', minRem: 0.75, maxRem: 0.8125, weight: 500, leading: 1.35, trackingEm: 0.01, numeric: false, color: 'muted' },
  body: { className: 'type-body', minRem: 0.875, maxRem: 0.9375, weight: 400, leading: 1.55, trackingEm: 0, numeric: false, color: 'inherit' },
  label: { className: 'type-label', minRem: 0.75, maxRem: 0.75, weight: 600, leading: 1.3, trackingEm: 0.04, numeric: false, color: 'muted' },
  caption: { className: 'type-caption', minRem: 0.6875, maxRem: 0.75, weight: 500, leading: 1.4, trackingEm: 0.01, numeric: false, color: 'muted' },
  navigation: { className: 'type-nav', minRem: 0.875, maxRem: 0.875, weight: 500, leading: 1.25, trackingEm: -0.01, numeric: false, color: 'inherit' },
  button: { className: 'type-button', minRem: 0.875, maxRem: 0.875, weight: 500, leading: 1, trackingEm: -0.01, numeric: false, color: 'inherit' },
  data: { className: 'type-data', minRem: 0.8125, maxRem: 0.875, weight: 600, leading: 1.2, trackingEm: 0, numeric: true, color: 'inherit' },
  code: { className: 'type-code', minRem: 0.75, maxRem: 0.8125, weight: 500, leading: 1.45, trackingEm: 0, numeric: false, color: 'inherit' },
}

const FLUID_MIN_PX = 352
const FLUID_MAX_PX = 1280
const HIERARCHY: TypographyRole[] = ['display', 'pageTitle', 'sectionTitle', 'cardTitle', 'body', 'caption']

function formatNumber(value: number): string {
  return String(Math.round(value * 10000) / 10000)
}

export function fluidTypeCss(role: TypographyRole): string {
  const spec = TYPOGRAPHY[role]
  if (spec.minRem === spec.maxRem) return `${formatNumber(spec.minRem)}rem`
  const delta = Math.round((spec.maxRem - spec.minRem) * 10000) / 10000
  return `clamp(${formatNumber(spec.minRem)}rem, ${formatNumber(spec.minRem)}rem + ${formatNumber(delta)}rem * ((100vw - 22rem) / 58rem), ${formatNumber(spec.maxRem)}rem)`
}

export function fluidSizeRem(role: TypographyRole, viewportPx: number): number {
  const spec = TYPOGRAPHY[role]
  if (!Number.isFinite(viewportPx)) return spec.minRem
  const progress = Math.min(1, Math.max(0, (viewportPx - FLUID_MIN_PX) / (FLUID_MAX_PX - FLUID_MIN_PX)))
  return Math.round((spec.minRem + (spec.maxRem - spec.minRem) * progress) * 10000) / 10000
}

function colorDeclaration(color: TypeColor): string {
  if (color === 'primary') return ' color: var(--text-primary);'
  if (color === 'muted') return ' color: var(--text-muted);'
  return ''
}

export function typographyRule(role: TypographyRole): string {
  const spec = TYPOGRAPHY[role]
  const family = role === 'code'
    ? ` font-family: var(--font-geist-mono), ${FONT_STRATEGY.fallbackMono};`
    : ''
  const numeric = spec.numeric
    ? ' font-variant-numeric: tabular-nums lining-nums; font-feature-settings: "tnum" 1, "lnum" 1;'
    : ''
  return `.${spec.className} { font-size: ${fluidTypeCss(role)}; font-weight: ${spec.weight}; line-height: ${spec.leading}; letter-spacing: ${formatNumber(spec.trackingEm)}em;${family}${colorDeclaration(spec.color)}${numeric} }`
}

export function typographyScaleIsHierarchical(): boolean {
  for (let index = 1; index < HIERARCHY.length; index += 1) {
    const larger = TYPOGRAPHY[HIERARCHY[index - 1]]
    const smaller = TYPOGRAPHY[HIERARCHY[index]]
    if (larger.maxRem <= smaller.maxRem || larger.minRem < smaller.minRem) return false
  }
  return true
}

export function numericRolesStayDistinct(): boolean {
  return TYPOGRAPHY.kpiHero.numeric
    && TYPOGRAPHY.data.numeric
    && !TYPOGRAPHY.body.numeric
    && TYPOGRAPHY.kpiHero.maxRem > TYPOGRAPHY.data.maxRem
    && TYPOGRAPHY.button.minRem === TYPOGRAPHY.button.maxRem
    && TYPOGRAPHY.label.minRem === TYPOGRAPHY.label.maxRem
    && TYPOGRAPHY.navigation.minRem === TYPOGRAPHY.navigation.maxRem
}

export const VIEWPORTS = { mobile: 390, tablet: 768, laptop: 1280, desktop: 1600 } as const

export function responsiveTypeSnapshot() {
  return {
    mobileDisplay: fluidSizeRem('display', VIEWPORTS.mobile),
    desktopDisplay: fluidSizeRem('display', VIEWPORTS.desktop),
    mobileButton: fluidSizeRem('button', VIEWPORTS.mobile),
    desktopButton: fluidSizeRem('button', VIEWPORTS.desktop),
    mobileLabel: fluidSizeRem('label', VIEWPORTS.mobile),
    desktopLabel: fluidSizeRem('label', VIEWPORTS.desktop),
    mobileCaption: fluidSizeRem('caption', VIEWPORTS.mobile),
    desktopCaption: fluidSizeRem('caption', VIEWPORTS.desktop),
  }
}

export function fontStrategyIsRestrained(): boolean {
  return FONT_STRATEGY.families.length <= FONT_STRATEGY.maxFamilies && FONT_STRATEGY.variable
}

export const ICON_STROKE = 1.75

export const ICON_SIZE_PX = {
  compact: 12,
  inline: 16,
  action: 18,
  navigation: 20,
  control: 24,
  feature: 32,
} as const

export const ICON_CATEGORIES = [
  'navigation',
  'action',
  'status',
  'data',
  'system',
  'communication',
  'decorative',
] as const

export type IconCategory = (typeof ICON_CATEGORIES)[number]
export type IconIntent = 'idle' | 'expand' | 'refresh' | 'success' | 'navigate'
export type IconPurpose = 'inline' | 'brand' | 'state' | 'kpi'
export type IconMotion = 'none' | 'spin' | 'reveal' | 'nudge'

const ICON_METRICS: Record<IconCategory, { size: number, stroke: number }> = {
  navigation: { size: ICON_SIZE_PX.navigation, stroke: ICON_STROKE },
  action: { size: ICON_SIZE_PX.action, stroke: ICON_STROKE },
  status: { size: ICON_SIZE_PX.inline, stroke: ICON_STROKE },
  data: { size: ICON_SIZE_PX.inline, stroke: ICON_STROKE },
  system: { size: ICON_SIZE_PX.action, stroke: ICON_STROKE },
  communication: { size: ICON_SIZE_PX.action, stroke: ICON_STROKE },
  decorative: { size: ICON_SIZE_PX.control, stroke: ICON_STROKE },
}

const ICON_SIZE_CLASS: Record<number, string> = {
  12: 'size-3',
  16: 'size-4',
  18: 'size-[18px]',
  20: 'size-5',
  24: 'size-6',
  32: 'size-8',
}

export function iconMetrics(category: IconCategory): { size: number, stroke: number } {
  return ICON_METRICS[category]
}

export function iconSizeClass(size: number): string {
  return ICON_SIZE_CLASS[size] ?? 'size-4'
}

export function iconMotion(category: IconCategory, intent: IconIntent): IconMotion {
  if (category === 'decorative') return 'none'
  if (intent === 'refresh') return 'spin'
  if (intent === 'success') return 'reveal'
  if (intent === 'expand' || intent === 'navigate') return 'nudge'
  return 'none'
}

export function usesIconWell(purpose: IconPurpose): boolean {
  return purpose === 'brand' || purpose === 'state' || purpose === 'kpi'
}

export const CHART_SERIES = [
  'primary',
  'secondary',
  'comparison',
  'positive',
  'negative',
  'warning',
  'neutral',
  'highlight',
  'muted',
] as const

export type ChartSeries = (typeof CHART_SERIES)[number]
type ChartPattern = 'solid' | 'dashed' | 'dot'

const CHART_PATTERN: Record<ChartSeries, ChartPattern> = {
  primary: 'solid',
  secondary: 'solid',
  comparison: 'dashed',
  positive: 'solid',
  negative: 'solid',
  warning: 'solid',
  neutral: 'dot',
  highlight: 'solid',
  muted: 'dashed',
}

export const CHART_GRID_PROPS = {
  stroke: 'var(--chart-grid)',
  strokeDasharray: '2 6',
  vertical: false,
} as const

export const CHART_AXIS_PROPS = {
  stroke: 'transparent',
  tickLine: false,
  axisLine: false,
  fontSize: 11,
  tick: { fill: 'var(--chart-axis)', fontSize: 11 },
} as const

export function chartColorVariable(series: ChartSeries): string {
  return `var(--chart-${series})`
}

export function chartPattern(series: ChartSeries): ChartPattern {
  return CHART_PATTERN[series]
}

export function chartStrokeDasharray(series: ChartSeries): string | undefined {
  const pattern = chartPattern(series)
  if (pattern === 'dashed') return '6 4'
  if (pattern === 'dot') return '1.5 6'
  return undefined
}

export function chartMeaningUsesMoreThanColor(): boolean {
  return new Set(CHART_SERIES.map((series) => chartPattern(series))).size > 1
}

export function chartDatasetKey(seriesId: string, count: number, first: string, last: string): string {
  return `${seriesId}:${count}:${first}:${last}`
}

export function shouldRestartChartMotion(
  previousKey: string | null,
  nextKey: string,
  reason: 'dataset' | 'hover' | 'tooltip' | 'filter-chrome',
): boolean {
  if (reason !== 'dataset') return false
  return previousKey !== nextKey
}

export function chartTooltipHasValue(value: unknown): boolean {
  return chartTooltipText(value) !== null
}

export function chartTooltipText(value: unknown): string | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value.toLocaleString()
  if (typeof value === 'string' && value.length > 0) return value
  return null
}

export const STATUS_KINDS = [
  'success',
  'warning',
  'error',
  'info',
  'pending',
  'processing',
  'disabled',
  'offline',
  'active',
  'inactive',
] as const

export type StatusKind = (typeof STATUS_KINDS)[number]

export const STATUS_TREATMENTS: Record<StatusKind, { tone: string, glyph: string, label: string }> = {
  success: { tone: 'var(--success)', glyph: '✓', label: 'สำเร็จ' },
  warning: { tone: 'var(--warning)', glyph: '!', label: 'คำเตือน' },
  error: { tone: 'var(--danger)', glyph: '×', label: 'ผิดพลาด' },
  info: { tone: 'var(--info)', glyph: 'i', label: 'ข้อมูล' },
  pending: { tone: 'var(--warning)', glyph: '…', label: 'รอดำเนินการ' },
  processing: { tone: 'var(--info)', glyph: '◌', label: 'กำลังทำงาน' },
  disabled: { tone: 'var(--text-disabled)', glyph: '–', label: 'ปิดใช้งาน' },
  offline: { tone: 'var(--text-muted)', glyph: '⊘', label: 'ออฟไลน์' },
  active: { tone: 'var(--success)', glyph: '●', label: 'ใช้งาน' },
  inactive: { tone: 'var(--text-muted)', glyph: '○', label: 'ไม่ได้ใช้งาน' },
}

const WORK_ITEM_STATUS_VISUAL: Record<string, StatusKind> = {
  completed: 'success',
  blocked: 'error',
  cancelled: 'disabled',
  'in-progress': 'processing',
  'sa-testing': 'pending',
  'pm-testing': 'pending',
  todo: 'active',
  backlog: 'inactive',
}

export function workItemStatusVisual(status: string): StatusKind {
  return WORK_ITEM_STATUS_VISUAL[status] ?? 'info'
}

export function statusCommunicatesWithoutColor(kind: StatusKind): boolean {
  const treatment = STATUS_TREATMENTS[kind]
  return treatment.glyph.length > 0 && treatment.label.length > 0 && treatment.tone.length > 0
}

export const VISUAL_STATE_KINDS = [
  'records',
  'activity',
  'search',
  'permission',
  'chart',
  'error',
  'network',
  'not-found',
  'partial',
  'success',
  'loading',
] as const

export type VisualStateKind = (typeof VISUAL_STATE_KINDS)[number]

export const VISUAL_STATES: Record<VisualStateKind, { tone: string, title: string, description: string, action: string }> = {
  records: { tone: 'neutral', title: 'ยังไม่มีรายการ', description: 'เมื่อมีข้อมูล รายการจะแสดงที่นี่', action: 'สร้างรายการ' },
  activity: { tone: 'neutral', title: 'ยังไม่มีกิจกรรม', description: 'กิจกรรมใหม่จะปรากฏหลังมีการบันทึก', action: 'ดูงานทั้งหมด' },
  search: { tone: 'neutral', title: 'ไม่พบผลลัพธ์', description: 'ลองเปลี่ยนคำค้นหรือตัวกรอง', action: 'ล้างตัวกรอง' },
  permission: { tone: 'warning', title: 'ไม่มีสิทธิ์เข้าถึง', description: 'หน้านี้เปิดให้เจ้าของระบบเท่านั้น', action: 'กลับ Dashboard' },
  chart: { tone: 'neutral', title: 'ยังไม่มีข้อมูลกราฟ', description: 'กราฟจะแสดงเมื่อมีรายการในช่วงที่เลือก', action: 'ปรับช่วงเวลา' },
  error: { tone: 'danger', title: 'ไม่สามารถแสดงข้อมูลได้', description: 'ลองอีกครั้ง หรือกลับไปยังหน้าเดิม', action: 'ลองอีกครั้ง' },
  network: { tone: 'danger', title: 'เชื่อมต่อไม่สำเร็จ', description: 'ตรวจการเชื่อมต่อแล้วลองใหม่', action: 'ลองอีกครั้ง' },
  'not-found': { tone: 'neutral', title: 'ไม่พบหน้าที่ต้องการ', description: 'หน้านี้อาจถูกย้ายหรือไม่มีอยู่แล้ว', action: 'กลับ Dashboard' },
  partial: { tone: 'danger', title: 'โหลดบางส่วนไม่สำเร็จ', description: 'ข้อมูลส่วนอื่นยังใช้งานได้', action: 'ลองโหลดอีกครั้ง' },
  success: { tone: 'success', title: 'บันทึกแล้ว', description: 'การเปลี่ยนแปลงถูกเก็บไว้แล้ว', action: 'ปิด' },
  loading: { tone: 'neutral', title: 'กำลังโหลด', description: 'ระบบกำลังเตรียมข้อมูล', action: '' },
}

/** permission has no screen: this installation has one owner and no permission-denied route. */
export const VISUAL_STATE_APPLICABILITY: Record<VisualStateKind, 'rendered' | 'not-applicable'> = {
  records: 'rendered',
  activity: 'rendered',
  search: 'rendered',
  permission: 'not-applicable',
  chart: 'rendered',
  error: 'rendered',
  network: 'rendered',
  'not-found': 'rendered',
  partial: 'rendered',
  success: 'rendered',
  loading: 'rendered',
}

export function loadFailureVisual(message: string): 'network' | 'error' {
  const normalized = message.trim().toLowerCase()
  if (normalized === 'failed to fetch' || normalized === 'load failed' || normalized.startsWith('networkerror') || normalized.includes('network request failed')) {
    return 'network'
  }
  return 'error'
}

export const SIGNATURES = [
  'identity-mark',
  'type-display',
  'type-kpi-hero',
  'icon-well',
  'chart-tooltip',
  'nav-rail',
] as const

export type SignatureName = (typeof SIGNATURES)[number]
