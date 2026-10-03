export const SETTINGS_THEMES = ['light', 'dark', 'special-dark'] as const
export const SETTINGS_LOCALES = ['th', 'en'] as const
export const SYSTEM_TIMEZONE = 'Asia/Bangkok' as const

export type SettingsTheme = (typeof SETTINGS_THEMES)[number]
export type SettingsLocale = (typeof SETTINGS_LOCALES)[number]

export interface OwnerSettings {
  profile: {
    name: string
    email: string
    phone: string | null
    avatar: string | null
  }
  preferences: {
    theme: SettingsTheme
    locale: SettingsLocale
    timezone: typeof SYSTEM_TIMEZONE
  }
}

export interface OwnerSettingsPatch {
  profile?: Partial<OwnerSettings['profile']>
  preferences?: Partial<Pick<OwnerSettings['preferences'], 'theme' | 'locale'>>
}

export function isSettingsPreferences(value: unknown): value is OwnerSettings['preferences'] {
  if (!isRecord(value)) return false
  return typeof value.theme === 'string'
    && SETTINGS_THEMES.includes(value.theme as SettingsTheme)
    && typeof value.locale === 'string'
    && SETTINGS_LOCALES.includes(value.locale as SettingsLocale)
    && value.timezone === SYSTEM_TIMEZONE
}

export interface SettingsParseResult {
  data?: OwnerSettingsPatch
  error?: { message: string; field?: string }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function hasOnlyKeys(value: Record<string, unknown>, allowed: readonly string[]) {
  return Object.keys(value).every((key) => allowed.includes(key))
}

type FieldValidation<T> = { value: T } | { error: { field: string; message: string } }

function invalidField<T>(field: string, message: string): FieldValidation<T> {
  return { error: { field, message } }
}

function isEmail(value: string) {
  const atIndex = value.indexOf('@')
  if (atIndex <= 0 || atIndex !== value.lastIndexOf('@') || atIndex === value.length - 1) return false

  const dotIndex = value.indexOf('.', atIndex + 1)
  if (dotIndex <= atIndex + 1 || dotIndex === value.length - 1) return false

  for (const character of value) {
    if (character.trim().length === 0) return false
  }
  return true
}

function parseName(value: unknown): FieldValidation<string> {
  if (typeof value !== 'string') return invalidField('name', 'ชื่อต้องมี 1–100 ตัวอักษร')
  const name = value.trim()
  if (name.length === 0 || name.length > 100) return invalidField('name', 'ชื่อต้องมี 1–100 ตัวอักษร')
  return { value: name }
}

function parseEmail(value: unknown): FieldValidation<string> {
  if (typeof value !== 'string') return invalidField('email', 'กรุณาระบุอีเมลที่ถูกต้อง')
  const email = value.trim()
  if (email.length > 254 || !isEmail(email)) return invalidField('email', 'กรุณาระบุอีเมลที่ถูกต้อง')
  return { value: email }
}

function parsePhone(value: unknown): FieldValidation<string | null> {
  if (value === null) return { value: null }
  if (typeof value !== 'string') return invalidField('phone', 'เบอร์โทรศัพท์ต้องเป็นข้อความหรือเว้นว่าง')
  const phone = value.trim()
  if (phone.length > 40) return invalidField('phone', 'เบอร์โทรศัพท์ต้องไม่เกิน 40 ตัวอักษร')
  return { value: phone || null }
}

function isHttpsUrl(value: string) {
  try {
    return new URL(value).protocol === 'https:'
  } catch {
    return false
  }
}

function parseAvatar(value: unknown): FieldValidation<string | null> {
  if (value === null) return { value: null }
  if (typeof value !== 'string') return invalidField('avatar', 'รูปโปรไฟล์ต้องเป็น URL ที่ปลอดภัยหรือเว้นว่าง')
  const avatar = value.trim()
  if (avatar.length > 0 && !isHttpsUrl(avatar)) return invalidField('avatar', 'รูปโปรไฟล์ต้องเป็น HTTPS URL')
  return { value: avatar || null }
}

function parseProfile(value: unknown): SettingsParseResult {
  if (!isRecord(value) || Object.keys(value).length === 0) {
    return { error: { field: 'profile', message: 'กรุณาระบุข้อมูลโปรไฟล์ที่ต้องการบันทึก' } }
  }
  if (!hasOnlyKeys(value, ['name', 'email', 'phone', 'avatar'])) {
    return { error: { field: 'profile', message: 'มีข้อมูลโปรไฟล์ที่ระบบไม่รองรับ' } }
  }

  const profile: NonNullable<OwnerSettingsPatch['profile']> = {}
  if (Object.hasOwn(value, 'name')) {
    const result = parseName(value.name)
    if ('error' in result) return { error: result.error }
    profile.name = result.value
  }
  if (Object.hasOwn(value, 'email')) {
    const result = parseEmail(value.email)
    if ('error' in result) return { error: result.error }
    profile.email = result.value
  }
  if (Object.hasOwn(value, 'phone')) {
    const result = parsePhone(value.phone)
    if ('error' in result) return { error: result.error }
    profile.phone = result.value
  }
  if (Object.hasOwn(value, 'avatar')) {
    const result = parseAvatar(value.avatar)
    if ('error' in result) return { error: result.error }
    profile.avatar = result.value
  }
  return { data: { profile } }
}

function parsePreferences(value: unknown): SettingsParseResult {
  if (!isRecord(value) || Object.keys(value).length === 0) {
    return { error: { field: 'preferences', message: 'กรุณาระบุ preference ที่ต้องการบันทึก' } }
  }
  if (!hasOnlyKeys(value, ['theme', 'locale'])) {
    return { error: { field: 'preferences', message: 'ระบบไม่รองรับ preference นี้; timezone ใช้ Asia/Bangkok คงที่' } }
  }

  const preferences: NonNullable<OwnerSettingsPatch['preferences']> = {}
  if (Object.hasOwn(value, 'theme')) {
    if (typeof value.theme !== 'string' || !SETTINGS_THEMES.includes(value.theme as SettingsTheme)) {
      return { error: { field: 'theme', message: 'กรุณาเลือก theme ที่ระบบรองรับ' } }
    }
    preferences.theme = value.theme as SettingsTheme
  }
  if (Object.hasOwn(value, 'locale')) {
    if (typeof value.locale !== 'string' || !SETTINGS_LOCALES.includes(value.locale as SettingsLocale)) {
      return { error: { field: 'locale', message: 'กรุณาเลือกภาษาที่ระบบรองรับ' } }
    }
    preferences.locale = value.locale as SettingsLocale
  }
  return { data: { preferences } }
}

export function parseOwnerSettingsPatch(value: unknown): SettingsParseResult {
  if (!isRecord(value) || !hasOnlyKeys(value, ['profile', 'preferences'])) {
    return { error: { message: 'รูปแบบ settings ไม่ถูกต้องหรือมี field ที่ระบบไม่รองรับ' } }
  }
  if (Object.keys(value).length === 0) {
    return { error: { message: 'กรุณาระบุข้อมูลที่ต้องการบันทึก' } }
  }

  const patch: OwnerSettingsPatch = {}
  if (Object.hasOwn(value, 'profile')) {
    const parsedProfile = parseProfile(value.profile)
    if (parsedProfile.error) return parsedProfile
    patch.profile = parsedProfile.data?.profile
  }
  if (Object.hasOwn(value, 'preferences')) {
    const parsedPreferences = parsePreferences(value.preferences)
    if (parsedPreferences.error) return parsedPreferences
    patch.preferences = parsedPreferences.data?.preferences
  }
  return { data: patch }
}
