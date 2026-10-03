'use client'

import * as React from 'react'
import { Moon, Sun, Sparkles } from 'lucide-react'
import { useTheme } from 'next-themes'

import { useOwnerSettings } from '@/components/layout/owner-settings-provider'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { toast } from '@/hooks/use-toast'

export function ThemeToggle() {
  const { theme } = useTheme()
  const { settings, isLoading, loadError, isSavingPreferences, savePreferences } = useOwnerSettings()
  const settingsUnavailable = isLoading || !settings || loadError !== null
  const [mounted, setMounted] = React.useState(false)
  const [savingTheme, setSavingTheme] = React.useState<string | null>(null)

  // useEffect only runs on the client, so now we can safely show the UI
  React.useEffect(() => {
    setMounted(true)
  }, [])

  const handleThemeChange = async (newTheme: 'light' | 'dark' | 'special-dark') => {
    if (newTheme === theme || savingTheme || settingsUnavailable || isSavingPreferences) return
    setSavingTheme(newTheme)
    try {
      await savePreferences({ theme: newTheme })
    } catch (error) {
      toast({
        title: 'บันทึก theme ไม่สำเร็จ',
        description: error instanceof Error ? error.message : 'ตรวจสอบการเชื่อมต่อแล้วลองอีกครั้ง',
        variant: 'destructive',
      })
    } finally {
      setSavingTheme(null)
    }
  }

  if (!mounted) {
    return (
      <Button variant="ghost" size="icon" className="h-9 w-9" disabled={settingsUnavailable || isSavingPreferences}>
        <Sun className="h-4 w-4" />
        <span className="sr-only">Toggle theme</span>
      </Button>
    )
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="h-9 w-9">
          {theme === 'light' && <Sun className="h-4 w-4" />}
          {theme === 'dark' && <Moon className="h-4 w-4" />}
          {theme === 'special-dark' && <Sparkles className="h-4 w-4" />}
          <span className="sr-only">Toggle theme</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem
          disabled={savingTheme !== null || settingsUnavailable || isSavingPreferences}
          onClick={() => handleThemeChange('light')}
          className="cursor-pointer"
        >
          <Sun className="mr-2 h-4 w-4" />
          <span>Light</span>
          {theme === 'light' && (
            <span className="ml-auto text-link">✓</span>
          )}
        </DropdownMenuItem>
        <DropdownMenuItem
          disabled={savingTheme !== null || settingsUnavailable || isSavingPreferences}
          onClick={() => handleThemeChange('dark')}
          className="cursor-pointer"
        >
          <Moon className="mr-2 h-4 w-4" />
          <span>Dark</span>
          {theme === 'dark' && (
            <span className="ml-auto text-link">✓</span>
          )}
        </DropdownMenuItem>
        <DropdownMenuItem
          disabled={savingTheme !== null || settingsUnavailable || isSavingPreferences}
          onClick={() => handleThemeChange('special-dark')}
          className="cursor-pointer"
        >
          <Sparkles className="mr-2 h-4 w-4" />
          <span>Special Dark</span>
          {theme === 'special-dark' && (
            <span className="ml-auto text-link">✓</span>
          )}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

