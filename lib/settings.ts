import { prisma } from '@/lib/db'
import type { Prisma } from '@prisma/client'
import { SYSTEM_TIMEZONE, type OwnerSettings, type OwnerSettingsPatch, type SettingsTheme } from '@/lib/settings-input'

const ownerSettingsSelect = {
  publicId: true,
  name: true,
  email: true,
  phone: true,
  avatar: true,
  theme: true,
  locale: true,
} as const

function serializeOwnerSettings(user: {
  name: string
  email: string
  phone: string | null
  avatar: string | null
  theme?: string | null
  locale?: string | null
}): OwnerSettings {
  const theme = fromDatabaseTheme(user.theme)
  const locale = user.locale === 'en' ? 'en' : 'th'
  return {
    profile: {
      name: user.name,
      email: user.email,
      phone: user.phone,
      avatar: user.avatar,
    },
    preferences: {
      theme,
      locale,
      timezone: SYSTEM_TIMEZONE,
    },
  }
}

function fromDatabaseTheme(theme?: string | null): SettingsTheme {
  if (theme === 'dark') return 'dark'
  if (theme === 'special_dark') return 'special-dark'
  return 'light'
}

function toDatabaseTheme(theme: SettingsTheme): 'light' | 'dark' | 'special_dark' {
  if (theme === 'special-dark') return 'special_dark'
  return theme
}

export async function getOwnerSettings(ownerInternalId: bigint): Promise<OwnerSettings | null> {
  const owner = await prisma.user.findUnique({
    where: { id: ownerInternalId },
    select: ownerSettingsSelect,
  })
  return owner ? serializeOwnerSettings(owner) : null
}

export async function updateOwnerSettings(ownerInternalId: bigint, patch: OwnerSettingsPatch): Promise<OwnerSettings> {
  const data: Prisma.UserUpdateInput = {
    ...patch.profile,
    ...(patch.preferences?.theme !== undefined ? { theme: toDatabaseTheme(patch.preferences.theme) } : {}),
    ...(patch.preferences?.locale !== undefined ? { locale: patch.preferences.locale } : {}),
  }
  const owner = await prisma.user.update({
    where: { id: ownerInternalId },
    data,
    select: ownerSettingsSelect,
  })
  return serializeOwnerSettings(owner)
}
