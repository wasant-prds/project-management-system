import type { ReactNode } from 'react'
import { CircleAlert, Inbox, LoaderCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { ContentLoadingSkeleton } from './content-loading-skeleton'

type PageStateProps = {
  title: string
  description?: string
  kind?: 'empty' | 'error' | 'loading'
  action?: ReactNode
  className?: string
  loadingLayout?: 'rows' | 'cards'
}

export function PageState({ title, description, kind = 'empty', action, className, loadingLayout = 'rows' }: Readonly<PageStateProps>) {
  const Icon = kind === 'error' ? CircleAlert : kind === 'loading' ? LoaderCircle : Inbox
  return (
    <div data-slot="page-state" role={kind === 'error' ? 'alert' : 'status'} aria-busy={kind === 'loading'} className={cn('motion-content-enter surface-inset flex min-w-0 flex-col items-center gap-3 rounded-xl border border-border/60 bg-muted/30 px-5 py-10 text-center', className)}>
      <span className={cn('surface-soft flex size-11 items-center justify-center rounded-xl bg-card', kind === 'error' ? 'text-danger' : 'text-link')}>
        <Icon aria-hidden="true" className={cn('size-5', kind === 'loading' && 'motion-safe:animate-spin')} />
      </span>
      <p className="content-wrap max-w-full font-semibold leading-snug">{title}</p>
      {description && <p className="content-wrap max-w-md text-sm leading-relaxed text-muted-foreground">{description}</p>}
      {kind === 'loading' && <ContentLoadingSkeleton layout={loadingLayout} />}
      {action}
    </div>
  )
}
