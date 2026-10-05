import type React from "react"
import type { Metadata } from "next"
import { GeistSans } from "geist/font/sans"
import { GeistMono } from "geist/font/mono"
import { Analytics } from "@vercel/analytics/next"
import { Suspense } from "react"
import { ThemeProvider } from "@/components/layout/theme-provider"
import { OwnerSettingsProvider } from "@/components/layout/owner-settings-provider"
import { ApplicationLoadingShell } from "@/components/layout/application-loading-shell"
import { Toaster } from "@/components/ui/toaster"
import { CinematicRuntime } from "@/components/layout/cinematic-runtime"
import { PerformanceMetrics } from "@/components/layout/performance-metrics"
import "./globals.css"

export const metadata: Metadata = {
  title: "Project Management System",
  description: "Advanced project management and collaboration platform",
  generator: "v0.app",
}

// DB-backed app: skip static prerender so build does not require DATABASE_URL
export const dynamic = "force-dynamic"

const isVercelAnalyticsEnabled = process.env.VERCEL_ANALYTICS_ENABLED === "true"

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="th" suppressHydrationWarning>
      <body className={`font-sans ${GeistSans.variable} ${GeistMono.variable}`}>
        <ThemeProvider
          attribute="class"
          defaultTheme="light"
          themes={['light', 'dark', 'special-dark']}
          disableTransitionOnChange
          storageKey="project-management-theme"
        >
          <OwnerSettingsProvider>
            <CinematicRuntime />
            <Suspense fallback={<ApplicationLoadingShell />}>
              {children}
              {isVercelAnalyticsEnabled && <Analytics />}
            </Suspense>
            <Toaster />
            {process.env.FRONTEND_PERFORMANCE_METRICS_ENABLED === 'true' && <PerformanceMetrics />}
          </OwnerSettingsProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
