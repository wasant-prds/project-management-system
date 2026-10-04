'use client'

import { ApplicationState } from '@/components/layout/application-state'

export default function ErrorPage({ reset }: Readonly<{ error: Error & { digest?: string }; reset: () => void }>) {
  return <ApplicationState kind="error" onRetry={reset} />
}
