'use client'

import { Component, lazy, Suspense, useState, type ComponentType, type ReactNode } from 'react'

export class SectionErrorBoundary extends Component<{ children: ReactNode; fallback: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  render() { return this.state.failed ? this.props.fallback : this.props.children }
}

/** A retry creates a new React.lazy identity; failed Webpack chunk loads can be requested again. */
export function RetryableLazy<P extends object>({ loader, componentProps, loading, error }: Readonly<{
  loader: () => Promise<{ default: ComponentType<P> }>
  componentProps: P
  loading: ReactNode
  error: (retry: () => void) => ReactNode
}>) {
  const [state, setState] = useState(() => ({ attempt: 0, loader, component: lazy(loader) }))
  if (state.loader !== loader) setState({ attempt: state.attempt + 1, loader, component: lazy(loader) })
  const LazyComponent = state.component
  const retry = () => setState((current) => ({ attempt: current.attempt + 1, loader, component: lazy(loader) }))
  return (
    <SectionErrorBoundary key={state.attempt} fallback={error(retry)}>
      <Suspense fallback={loading}><LazyComponent {...componentProps} /></Suspense>
    </SectionErrorBoundary>
  )
}
