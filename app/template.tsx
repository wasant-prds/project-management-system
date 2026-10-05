import type { ReactNode } from 'react'

/** App Router remounts templates between routes, giving each page a short entry. */
export default function Template({ children }: Readonly<{ children: ReactNode }>) {
  return <div data-cinematic="route" className="motion-page-enter min-h-svh">{children}</div>
}
