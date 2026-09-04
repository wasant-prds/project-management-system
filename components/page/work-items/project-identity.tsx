import { cn } from '@/lib/utils'
import { projectAccentStyle, projectInitials } from './work-item-presentation'

type ProjectIdentityProps = {
  name: string
  color: string | null | undefined
  size?: 'sm' | 'md'
  showRail?: boolean
  className?: string
}

export function ProjectIdentity({
  name,
  color,
  size = 'sm',
  showRail = true,
  className,
}: Readonly<ProjectIdentityProps>) {
  const accent = projectAccentStyle(color)
  const compact = size === 'sm'

  return (
    <div
          className={cn(
            'relative flex items-center gap-2.5 overflow-hidden border-b border-border/50',
            compact ? 'px-4 py-2.5' : 'px-6 py-3.5 pr-12',
            className,
          )}
      style={{
        background: `linear-gradient(90deg, ${accent.backgroundColor} 0%, ${accent.softBackground} 42%, transparent 100%)`,
      }}
    >
      {showRail && (
        <span
          aria-hidden
          className="absolute inset-y-2 left-0 w-[3px] rounded-full"
          style={{ backgroundColor: accent.color }}
        />
      )}
      <div
        className={cn(
          'flex shrink-0 items-center justify-center rounded-md font-semibold tracking-wide',
          compact ? 'h-7 w-7 text-[10px]' : 'h-8 w-8 text-[11px]',
          showRail && 'ml-1',
        )}
        style={{
          color: accent.color,
          backgroundColor: accent.backgroundColor,
          boxShadow: `inset 0 0 0 1px ${accent.color}33`,
        }}
      >
        {projectInitials(name)}
      </div>
      <div className="min-w-0">
        <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
          Project
        </p>
        <p
          className={cn('truncate font-semibold leading-tight', compact ? 'text-xs' : 'text-sm')}
          style={{ color: accent.color }}
        >
          {name}
        </p>
      </div>
    </div>
  )
}
