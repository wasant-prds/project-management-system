import * as React from 'react'
import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'

import { cn } from '@/lib/utils'

const buttonVariants = cva(
  "motion-control inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-[var(--radius-control)] text-sm font-medium motion-safe:enabled:hover:-translate-y-px motion-safe:active:translate-y-px disabled:pointer-events-none disabled:border disabled:border-border disabled:bg-disabled disabled:text-disabled-foreground disabled:opacity-100 disabled:shadow-none motion-reduce:transition-none motion-reduce:active:translate-y-0 [&_span]:text-inherit [&_svg]:pointer-events-none [&_svg]:text-current [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive",
  {
    variants: {
      variant: {
        default: 'surface-soft active:surface-pressed bg-primary text-primary-foreground hover:bg-primary-hover active:bg-primary-active',
        destructive:
          'surface-soft active:surface-pressed bg-destructive text-destructive-foreground hover:bg-destructive-hover active:bg-destructive-active',
        outline:
          'surface-soft active:surface-inset border border-border-strong bg-card text-foreground hover:bg-hover active:bg-pressed',
        secondary:
          'surface-soft active:surface-inset bg-secondary text-secondary-foreground hover:bg-hover active:bg-pressed',
        ghost:
          'text-foreground hover:bg-hover active:bg-pressed',
        link: 'text-link underline-offset-4 hover:underline',
        info: 'surface-soft active:surface-pressed bg-primary text-primary-foreground hover:bg-primary-hover active:bg-primary-active',
        success: 'surface-soft active:surface-pressed bg-success-solid text-inverse hover:bg-success-hover active:bg-success-active',
        neutral: 'surface-soft active:surface-pressed bg-neutral-solid text-inverse hover:bg-neutral-hover active:bg-neutral-active',
      },
      size: {
        default: 'h-9 px-4 py-2 has-[>svg]:px-3',
        sm: 'h-8 rounded-md gap-1.5 px-3 has-[>svg]:px-2.5',
        lg: 'h-10 rounded-md px-6 has-[>svg]:px-4',
        icon: 'size-9',
        'icon-sm': 'size-8',
        'icon-lg': 'size-10',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
)

function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: React.ComponentProps<'button'> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot : 'button'

  return (
    <Comp
      data-slot="button"
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    />
  )
}

export { Button, buttonVariants }
