'use client'

import { useTheme as useNextTheme } from 'next-themes'

export type Theme = 'light' | 'dark' | 'special-dark' | 'system'

export function useTheme() {
  const { theme, setTheme, systemTheme, resolvedTheme } = useNextTheme()

  return {
    theme: theme as Theme,
    setTheme: (newTheme: Theme) => setTheme(newTheme),
    systemTheme: systemTheme as Theme | undefined,
    resolvedTheme: resolvedTheme as Theme | undefined,
    // Helper methods
    isLight: resolvedTheme === 'light',
    isDark: resolvedTheme === 'dark' || resolvedTheme === 'special-dark',
    isSpecialDark: resolvedTheme === 'special-dark',
    isSystem: theme === 'system',
  }
}

