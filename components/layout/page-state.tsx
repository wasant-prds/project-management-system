import type { ReactNode } from 'react'
import { CircleAlert, Inbox, LoaderCircle } from 'lucide-react'
import { VISUAL_STATES, type VisualStateKind } from '@/components/ui/product-identity'
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
}

function stateIcon(kind: PageStateKind) {
  if (kind === 'error') return CircleAlert
  if (kind === 'loading') return LoaderCircle
  return Inbox
}

function stateVisual(kind: PageStateKind, visual?: VisualStateKind): VisualStateKind {
  if (visual) return visual
  if (kind === 'error') return 'error'
  if (kind === 'loading') return 'loading'
  return 'records'
}

function stateTone(kind: PageStateKind, visual: VisualStateKind): StateTone {
  if (kind === 'error') return 'danger'
  const tone = VISUAL_STATES[visual].tone
  if (tone === 'danger' || tone === 'success' || tone === 'warning') return tone
  return 'neutral'
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
  const Icon = stateIcon(kind)
  const role = inlineRole(kind, live)
  return (
    <div data-slot="inline-state" data-visual={resolvedVisual} role={role} className={cn('identity-empty flex min-w-0 flex-wrap items-center gap-3 border border-border/60 px-3 py-3 text-left', className)}>
      <span data-slot="identity-mark" data-tone={tone} className={cn('icon-well identity-mark surface-soft flex size-8 shrink-0 items-center justify-center rounded-lg bg-card', tone === 'danger' && 'text-danger', tone === 'success' && 'text-success', tone === 'warning' && 'text-warning', tone === 'neutral' && 'text-link')}>
        <Icon aria-hidden="true" strokeWidth={1.75} className="size-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="type-card-title content-wrap">{title}</p>
        {description && <p className="type-caption content-wrap mt-0.5">{description}</p>}
      </div>
      {action}
    </div>
  )
}

export function PageState({ title, description, kind = 'empty', visual, action, className, loadingLayout = 'rows' }: Readonly<PageStateProps>) {
  const resolvedVisual = stateVisual(kind, visual)
  const tone = stateTone(kind, resolvedVisual)
  const Icon = stateIcon(kind)
  const busy = kind === 'loading'
  return (
    <div data-slot="page-state" data-visual={resolvedVisual} role={kind === 'error' ? 'alert' : 'status'} aria-busy={busy} className={cn('motion-content-enter identity-state surface-inset flex min-w-0 flex-col items-center gap-3 rounded-xl border border-border/60 bg-muted/30 px-5 py-10 text-center', className)}>
      <span data-slot="identity-mark" data-tone={tone} className={cn('icon-well identity-mark surface-soft flex size-11 items-center justify-center rounded-xl bg-card', tone === 'danger' && 'text-danger', tone === 'success' && 'text-success', tone === 'warning' && 'text-warning', tone === 'neutral' && 'text-link')}>
        <Icon aria-hidden="true" strokeWidth={1.75} className={cn('size-5', busy && 'motion-safe:animate-spin')} />
      </span>
      <p className="type-section content-wrap max-w-full">{title}</p>
      {description && <p className="type-body content-wrap max-w-md text-muted-foreground">{description}</p>}
      {busy && <ContentLoadingSkeleton layout={loadingLayout} />}
      {action}
    </div>
  )
}
