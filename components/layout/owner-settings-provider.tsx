'use client'

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { useTheme } from 'next-themes'
import type { OwnerSettings, OwnerSettingsPatch } from '@/lib/settings-input'

type ProfilePatch = NonNullable<OwnerSettingsPatch['profile']>
type PreferencesPatch = NonNullable<OwnerSettingsPatch['preferences']>

interface OwnerSettingsContextValue {
  settings: OwnerSettings | null
  isLoading: boolean
  loadError: string | null
  isSavingProfile: boolean
  isSavingPreferences: boolean
  reload: () => void
  saveProfile: (profile: ProfilePatch) => Promise<void>
  savePreferences: (preferences: PreferencesPatch) => Promise<void>
}

const OwnerSettingsContext = createContext<OwnerSettingsContextValue | null>(null)

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isOwnerSettings(value: unknown): value is OwnerSettings {
  if (!isRecord(value) || !isRecord(value.profile) || !isRecord(value.preferences)) return false
  const { profile, preferences } = value
  return typeof profile.name === 'string'
    && typeof profile.email === 'string'
    && (typeof profile.phone === 'string' || profile.phone === null)
    && (typeof profile.avatar === 'string' || profile.avatar === null)
    && (preferences.theme === 'light' || preferences.theme === 'dark' || preferences.theme === 'special-dark')
    && (preferences.locale === 'th' || preferences.locale === 'en')
    && preferences.timezone === 'Asia/Bangkok'
}

function responseError(value: unknown) {
  if (!isRecord(value) || !isRecord(value.error) || typeof value.error.message !== 'string') {
    return 'ไม่สามารถอ่านหรือบันทึกการตั้งค่าได้ กรุณาลองใหม่'
  }
  return value.error.message
}

async function readSettingsResponse(response: Response): Promise<OwnerSettings> {
  const value: unknown = await response.json().catch(() => null)
  if (!response.ok) throw new Error(responseError(value))
  if (!isOwnerSettings(value)) throw new Error('ข้อมูลจาก server ไม่ถูกต้อง กรุณาลองใหม่')
  return value
}

function mergeProfile(current: OwnerSettings['profile'], saved: OwnerSettings['profile'], patch: ProfilePatch) {
  const profile = { ...current }
  if (patch.name !== undefined) profile.name = saved.name
  if (patch.email !== undefined) profile.email = saved.email
  if (patch.phone !== undefined) profile.phone = saved.phone
  if (patch.avatar !== undefined) profile.avatar = saved.avatar
  return profile
}

function mergePreferences(current: OwnerSettings['preferences'], saved: OwnerSettings['preferences'], patch: PreferencesPatch) {
  const preferences = { ...current }
  if (patch.theme !== undefined) preferences.theme = saved.theme
  if (patch.locale !== undefined) preferences.locale = saved.locale
  return preferences
}

export function OwnerSettingsProvider({ children }: Readonly<{ children: ReactNode }>) {
  const { setTheme } = useTheme()
  const [settings, setSettings] = useState<OwnerSettings | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [isSavingProfile, setIsSavingProfile] = useState(false)
  const [isSavingPreferences, setIsSavingPreferences] = useState(false)
  const [reloadCount, setReloadCount] = useState(0)
  const profileSaveLock = useRef(false)
  const preferencesSaveLock = useRef(false)
  const loadLock = useRef(true)

  useEffect(() => {
    let active = true
    loadLock.current = true
    setIsLoading(true)
    setLoadError(null)

    async function loadSettings() {
      try {
        const response = await fetch('/api/settings/me', { cache: 'no-store' })
        const saved = await readSettingsResponse(response)
        if (!active) return
        setSettings(saved)
        setTheme(saved.preferences.theme)
        document.documentElement.lang = saved.preferences.locale
      } catch (error) {
        if (active) setLoadError(error instanceof Error ? error.message : 'ไม่สามารถโหลดการตั้งค่าได้')
      } finally {
        if (active) {
          loadLock.current = false
          setIsLoading(false)
        }
      }
    }

    loadSettings().catch(() => undefined)
    return () => {
      active = false
    }
  }, [reloadCount, setTheme])

  async function patchSettings(patch: OwnerSettingsPatch) {
    const response = await fetch('/api/settings/me', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    })
    return readSettingsResponse(response)
  }

  async function saveProfile(profile: ProfilePatch) {
    if (isLoading || loadLock.current || !settings) throw new Error('กำลังโหลดการตั้งค่า กรุณาลองอีกครั้ง')
    if (Object.keys(profile).length === 0) return
    if (profileSaveLock.current) throw new Error('กำลังบันทึกโปรไฟล์ กรุณารอสักครู่')
    profileSaveLock.current = true
    setIsSavingProfile(true)
    try {
      const saved = await patchSettings({ profile })
      setSettings((current) => ({
        ...(current ?? saved),
        profile: mergeProfile(current?.profile ?? saved.profile, saved.profile, profile),
      }))
      setLoadError(null)
    } finally {
      profileSaveLock.current = false
      setIsSavingProfile(false)
    }
  }

  async function savePreferences(preferences: PreferencesPatch) {
    if (isLoading || loadLock.current || !settings) throw new Error('กำลังโหลดการตั้งค่า กรุณาลองอีกครั้ง')
    if (Object.keys(preferences).length === 0) return
    if (preferencesSaveLock.current) throw new Error('กำลังบันทึกการตั้งค่า กรุณารอสักครู่')
    preferencesSaveLock.current = true
    setIsSavingPreferences(true)
    try {
      const saved = await patchSettings({ preferences })
      const currentPreferences = settings?.preferences ?? saved.preferences
      const mergedPreferences = mergePreferences(currentPreferences, saved.preferences, preferences)
      setSettings((current) => ({
        ...(current ?? saved),
        preferences: mergePreferences(current?.preferences ?? saved.preferences, saved.preferences, preferences),
      }))
      setTheme(mergedPreferences.theme)
      document.documentElement.lang = mergedPreferences.locale
      setLoadError(null)
    } finally {
      preferencesSaveLock.current = false
      setIsSavingPreferences(false)
    }
  }

  function reload() {
    loadLock.current = true
    setIsLoading(true)
    setLoadError(null)
    setReloadCount((count) => count + 1)
  }

  const value: OwnerSettingsContextValue = {
    settings,
    isLoading,
    loadError,
    isSavingProfile,
    isSavingPreferences,
    reload,
    saveProfile,
    savePreferences,
  }

  return <OwnerSettingsContext.Provider value={value}>{children}</OwnerSettingsContext.Provider>
}

export function useOwnerSettings() {
  const context = useContext(OwnerSettingsContext)
  if (!context) throw new Error('useOwnerSettings must be used within OwnerSettingsProvider')
  return context
}
