'use client'

import type { ReactNode } from 'react'
import { STATUS_TREATMENTS, iconMotion } from '@/components/ui/product-identity'
import { useToast } from '@/hooks/use-toast'
import {
  Toast,
  ToastClose,
  ToastDescription,
  ToastProvider,
  ToastTitle,
  ToastViewport,
} from '@/components/ui/toast'

type ToastMessageProps = {
  title?: ReactNode
  description?: ReactNode
  action?: ReactNode
  variant?: 'default' | 'destructive' | null
}

export function ToastMessage({ title, description, action, variant }: Readonly<ToastMessageProps>) {
  const tone = variant === 'destructive' ? 'error' : 'success'
  const treatment = STATUS_TREATMENTS[tone]
  return (
    <>
      <div data-slot="toast-body" data-visual={tone === 'error' ? 'error' : 'success'} className="flex min-w-0 flex-1 items-start gap-3">
        <span aria-hidden="true" data-slot="status-glyph" data-status={tone} data-icon-motion={iconMotion('status', tone === 'success' ? 'success' : 'idle')} className="status-glyph" style={tone === 'success' ? { color: treatment.tone } : undefined}>{treatment.glyph}</span>
        <div className="grid min-w-0 gap-1">
          {title && <ToastTitle>{title}</ToastTitle>}
          {description && <ToastDescription>{description}</ToastDescription>}
          <span className="sr-only">{treatment.label}</span>
        </div>
      </div>
      {action}
    </>
  )
}

export function Toaster() {
  const { toasts } = useToast()

  return (
    <ToastProvider>
      {toasts.map(function ({ id, title, description, action, variant, ...props }) {
        return (
          <Toast key={id} variant={variant} {...props}>
            <ToastMessage title={title} description={description} action={action} variant={variant} />
            <ToastClose />
          </Toast>
        )
      })}
      <ToastViewport />
    </ToastProvider>
  )
}
