import type { ReactNode } from 'react'

/** App Router remounts templates between routes. Only main content owns the entrance. */
export default function Template({ children }: Readonly<{ children: ReactNode }>) {
  return <div data-cinematic="route" className="motion-page-enter min-h-svh">{children}</div>
}
