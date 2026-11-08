import { users } from '@/lib/database/repositories/users'
import type { User } from '@/lib/database/types'
import {
  SYSTEM_TIMEZONE,
  type OwnerSettings,
  type OwnerSettingsPatch,
  type SettingsTheme,
} from '@/lib/settings-input'

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
  if (theme === 'special-dark') return 'special-dark'
  return 'light'
}

function toDatabaseTheme(theme: SettingsTheme): 'light' | 'dark' | 'special-dark' {
  if (theme === 'special-dark') return 'special-dark'
  return theme
}

export async function getOwnerSettings(ownerInternalId: bigint): Promise<OwnerSettings | null> {
  const owner = await users.byId(ownerInternalId)
  return owner ? serializeOwnerSettings(owner) : null
}

export async function updateOwnerSettings(
  ownerInternalId: bigint,
  patch: OwnerSettingsPatch,
): Promise<OwnerSettings> {
  const data: Partial<Pick<User, 'name' | 'email' | 'phone' | 'avatar' | 'theme' | 'locale'>> = {
    ...patch.profile,
    ...(patch.preferences?.theme !== undefined ? { theme: toDatabaseTheme(patch.preferences.theme) } : {}),
    ...(patch.preferences?.locale !== undefined ? { locale: patch.preferences.locale } : {}),
  }
  const owner = await users.update(ownerInternalId, data)
  return serializeOwnerSettings(owner)
}
