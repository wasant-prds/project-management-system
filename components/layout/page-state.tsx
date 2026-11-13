import type { ReactNode } from 'react'
import {
  ChartNoAxesColumn, CircleAlert, CircleCheck, Compass, History, Inbox, LoaderCircle, SearchX,
  ShieldAlert, WifiOff, type LucideIcon,
} from 'lucide-react'
import { VISUAL_STATES, loadFailureVisual, type VisualStateKind } from '@/components/ui/product-identity'
import { cn } from '@/lib/utils'
import { ContentLoadingSkeleton } from './content-loading-skeleton'

type PageStateKind = 'empty' | 'error' | 'loading'
type StateTone = 'neutral' | 'danger' | 'success' | 'warning'

type PageStateProps = {
  title: string
  description?: string
  kind?: PageStateKind
  visual?: VisualStateKind
  action?: ReactNode
  className?: string
  loadingLayout?: 'rows' | 'cards'
  /** `page` fills a content region; `section` sits inside a card or tab panel. */
  density?: 'page' | 'section'
  /** Full-page fallbacks own the document heading; regions keep a paragraph title. */
  titleAs?: 'p' | 'h1' | 'h2'
}

/** The glyph names the reason, so "no records", "no matches" and "offline" never look alike. */
const VISUAL_ICONS: Record<VisualStateKind, LucideIcon> = {
  records: Inbox,
  activity: History,
  search: SearchX,
  permission: ShieldAlert,
  chart: ChartNoAxesColumn,
  error: CircleAlert,
  network: WifiOff,
  'not-found': Compass,
  partial: CircleAlert,
  success: CircleCheck,
  loading: LoaderCircle,
}

function stateVisual(kind: PageStateKind, visual?: VisualStateKind): VisualStateKind {
  if (kind === 'loading') return 'loading'
  if (visual) return visual
  if (kind === 'error') return 'error'
  return 'records'
}

function stateTone(kind: PageStateKind, visual: VisualStateKind): StateTone {
  if (kind === 'error') return 'danger'
  const tone = VISUAL_STATES[visual].tone
  if (tone === 'danger' || tone === 'success' || tone === 'warning') return tone
  return 'neutral'
}

/** Raw browser transport text ("Failed to fetch") is replaced by guidance the owner can act on. */
function stateDescription(visual: VisualStateKind, description?: string) {
  if (visual === 'network' && description && loadFailureVisual(description) === 'network') return VISUAL_STATES.network.description
  return description
}

function markToneClass(tone: StateTone) {
  if (tone === 'danger') return 'text-danger'
  if (tone === 'success') return 'text-success'
  if (tone === 'warning') return 'text-warning'
  return 'text-link'
}

type InlineStateProps = {
  title: string
  description?: string
  kind?: 'empty' | 'error'
  visual?: VisualStateKind
  action?: ReactNode
  className?: string
  /** Announce one empty region. Leave off when several empties can appear together. */
  live?: boolean
}

function inlineRole(kind: 'empty' | 'error', live: boolean) {
  if (kind === 'error') return 'alert'
  if (live) return 'status'
  return undefined
}

/** Compact empty or error for cards, columns and chart frames. No entrance motion. */
export function InlineState({ title, description, kind = 'empty', visual, action, className, live = false }: Readonly<InlineStateProps>) {
  const resolvedVisual = stateVisual(kind, visual)
  const tone = stateTone(kind, resolvedVisual)
  const Icon = VISUAL_ICONS[resolvedVisual]
  const role = inlineRole(kind, live)
  const text = stateDescription(resolvedVisual, description)
  return (
    <div data-slot="inline-state" data-visual={resolvedVisual} role={role} className={cn('identity-empty flex min-w-0 flex-wrap items-center gap-3 border border-border/60 px-3 py-3 text-left', className)}>
      <span data-slot="identity-mark" data-tone={tone} className={cn('icon-well identity-mark surface-soft flex size-8 shrink-0 items-center justify-center rounded-lg bg-card', markToneClass(tone))}>
        <Icon aria-hidden="true" strokeWidth={1.75} className="size-4" />
      </span>
      <div className="min-w-0 flex-1 basis-48">
        <p className="type-card-title content-wrap">{title}</p>
        {text && <p className="type-caption content-wrap mt-0.5">{text}</p>}
      </div>
      {action && <div data-slot="inline-state-action" className="flex shrink-0 flex-wrap gap-2">{action}</div>}
    </div>
  )
}

export function PageState({ title, description, kind = 'empty', visual, action, className, loadingLayout = 'rows', density = 'page', titleAs: Title = 'p' }: Readonly<PageStateProps>) {
  const resolvedVisual = stateVisual(kind, visual)
  const tone = stateTone(kind, resolvedVisual)
  const Icon = VISUAL_ICONS[resolvedVisual]
  const busy = kind === 'loading'
  const section = density === 'section'
  const text = stateDescription(resolvedVisual, description)
  return (
    <div data-slot="page-state" data-visual={resolvedVisual} data-density={density} role={kind === 'error' ? 'alert' : 'status'} aria-busy={busy} className={cn('motion-content-enter identity-state surface-inset flex min-w-0 flex-col items-center rounded-xl border border-border/60 bg-muted/30 text-center', section ? 'gap-2 px-4 py-6' : 'gap-3 px-5 py-10', className)}>
      <span data-slot="identity-mark" data-tone={tone} className={cn('icon-well identity-mark surface-soft flex items-center justify-center rounded-xl bg-card', section ? 'size-9' : 'size-11', markToneClass(tone))}>
        <Icon aria-hidden="true" strokeWidth={1.75} className={cn(section ? 'size-4' : 'size-5', busy && 'motion-safe:animate-spin')} />
      </span>
      <Title className={cn(section ? 'type-card-title' : 'type-section', 'content-wrap max-w-full')}>{title}</Title>
      {text && <p className="type-body content-wrap max-w-md text-muted-foreground">{text}</p>}
      {busy && <ContentLoadingSkeleton layout={loadingLayout} />}
      {action && <div data-slot="page-state-action" className="mt-1 flex w-full flex-col items-stretch justify-center gap-2 sm:w-auto sm:flex-row sm:items-center">{action}</div>}
    </div>
  )
}
