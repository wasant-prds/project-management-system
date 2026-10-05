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
