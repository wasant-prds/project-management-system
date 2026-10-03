'use client'

import { useState, type FormEvent } from 'react'
import { AppSidebar } from '@/components/layout/app-sidebar'
import { AppHeader } from '@/components/layout/app-header'
import { useOwnerSettings } from '@/components/layout/owner-settings-provider'
import {
  PAGE_HEADING,
  PAGE_INNER,
  PAGE_LEAD,
  PAGE_MAIN,
  TAB_SCROLL_CLASS,
  TAB_TRIGGER_CLASS,
} from '@/components/layout/page-layout'
import { SidebarProvider, SidebarInset } from '@/components/ui/sidebar'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { SETTINGS_LOCALES, SETTINGS_THEMES, type OwnerSettings, type SettingsLocale, type SettingsTheme } from '@/lib/settings-input'

type Feedback = { kind: 'success' | 'error'; message: string }
type Profile = OwnerSettings['profile']
type ProfileDraft = Partial<Profile>
type PreferencesDraft = { theme?: SettingsTheme; locale?: SettingsLocale }

const themeLabels: Record<SettingsTheme, string> = { light: 'สว่าง', dark: 'มืด', 'special-dark': 'มืดพิเศษ' }
const localeLabels: Record<SettingsLocale, string> = { th: 'ไทย', en: 'English' }

function getAvatarInitials(name: string) {
  return Array.from(name.trim()).slice(0, 2).join('').toLocaleUpperCase('th') || 'PMS'
}

function changedProfile(profile: Profile, draft: ProfileDraft): ProfileDraft {
  return Object.fromEntries(
    Object.entries(draft).filter(([key, value]) => profile[key as keyof Profile] !== value),
  ) as ProfileDraft
}

export default function SettingsPage() {
  const {
    settings,
    isLoading,
    loadError,
    isSavingProfile,
    isSavingPreferences,
    reload,
    saveProfile,
    savePreferences,
  } = useOwnerSettings()
  const [profileDraft, setProfileDraft] = useState<ProfileDraft>({})
  const [preferencesDraft, setPreferencesDraft] = useState<PreferencesDraft>({})
  const [profileFeedback, setProfileFeedback] = useState<Feedback | null>(null)
  const [preferencesFeedback, setPreferencesFeedback] = useState<Feedback | null>(null)

  const profile = settings ? { ...settings.profile, ...profileDraft } : null
  const preferences = settings
    ? { ...settings.preferences, ...preferencesDraft }
    : null
  const profileChanges = settings ? changedProfile(settings.profile, profileDraft) : {}
  const preferencesChanges = settings && preferences
    ? {
        ...(preferences.theme !== settings.preferences.theme ? { theme: preferences.theme } : {}),
        ...(preferences.locale !== settings.preferences.locale ? { locale: preferences.locale } : {}),
      }
    : {}

  async function handleProfileSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (Object.keys(profileChanges).length === 0) return
    setProfileFeedback(null)
    try {
      await saveProfile(profileChanges)
      setProfileDraft({})
      setProfileFeedback({ kind: 'success', message: 'บันทึกโปรไฟล์แล้ว' })
    } catch (error) {
      setProfileFeedback({
        kind: 'error',
        message: error instanceof Error ? error.message : 'บันทึกโปรไฟล์ไม่สำเร็จ',
      })
    }
  }

  async function handlePreferencesSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (Object.keys(preferencesChanges).length === 0) return
    setPreferencesFeedback(null)
    try {
      await savePreferences(preferencesChanges)
      setPreferencesDraft({})
      setPreferencesFeedback({ kind: 'success', message: 'บันทึกการตั้งค่าแล้ว' })
    } catch (error) {
      setPreferencesFeedback({
        kind: 'error',
        message: error instanceof Error ? error.message : 'บันทึกการตั้งค่าไม่สำเร็จ',
      })
    }
  }

  function cancelProfileChanges() {
    setProfileDraft({})
    setProfileFeedback(null)
  }

  function cancelPreferenceChanges() {
    setPreferencesDraft({})
    setPreferencesFeedback(null)
  }

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <AppHeader />
        <main className={PAGE_MAIN} aria-busy={isLoading}>
          <div className={PAGE_INNER}>
            <div className="page-toolbar"><p className="page-eyebrow mb-2">Personal workspace</p>
              <h1 className={PAGE_HEADING}>การตั้งค่า</h1>
              <p className={PAGE_LEAD}>จัดการโปรไฟล์และการตั้งค่าของเจ้าของระบบ</p>
            </div>

            {isLoading && <output className="text-sm text-muted-foreground">กำลังโหลดการตั้งค่า...</output>}
            {loadError && (
              <Card>
                <CardContent className="space-y-3 p-5">
                  <p role="alert" className="text-sm text-danger">{loadError}</p>
                  <Button type="button" variant="outline" onClick={reload}>
                    ลองโหลดอีกครั้ง
                  </Button>
                </CardContent>
              </Card>
            )}

            {!isLoading && !loadError && profile && preferences && (
              <Tabs defaultValue="profile" className="min-w-0 gap-5 lg:grid lg:grid-cols-[15rem_minmax(0,1fr)] lg:items-start">
                <div className={TAB_SCROLL_CLASS}>
                  <TabsList aria-label="หมวดการตั้งค่า" className="lg:h-auto lg:w-full lg:flex-col lg:items-stretch lg:gap-2 lg:p-2">
                    <TabsTrigger className={`${TAB_TRIGGER_CLASS} lg:min-h-11 lg:justify-start`} value="profile">โปรไฟล์</TabsTrigger>
                    <TabsTrigger className={`${TAB_TRIGGER_CLASS} lg:min-h-11 lg:justify-start`} value="preferences">การแสดงผล</TabsTrigger>
                  </TabsList>
                </div>

                <TabsContent value="profile" className="space-y-4">
                  <Card>
                    <CardHeader>
                      <CardTitle>โปรไฟล์เจ้าของระบบ</CardTitle>
                      <CardDescription>ข้อมูลนี้ผูกกับ owner account ที่ยืนยันตัวตนอยู่; อีเมลนี้ไม่เปลี่ยน credential ของ access gate</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <form className="space-y-6" onSubmit={handleProfileSubmit}>
                        <div className="flex items-center gap-4">
                          <Avatar className="h-16 w-16 border border-border">
                            {profile.avatar && <AvatarImage src={profile.avatar} alt="รูปโปรไฟล์เจ้าของระบบ" />}
                            <AvatarFallback className="bg-primary/10 font-semibold text-link">
                              {getAvatarInitials(profile.name)}
                            </AvatarFallback>
                          </Avatar>
                          <p className="text-sm text-muted-foreground">รูปโปรไฟล์จะแสดงเมื่อมี avatar ที่บันทึกไว้ในบัญชี</p>
                        </div>

                        <div className="grid gap-4 sm:grid-cols-2">
                          <div className="space-y-2">
                            <Label htmlFor="owner-name">ชื่อที่แสดง</Label>
                            <Input
                              id="owner-name"
                              autoComplete="name"
                              maxLength={100}
                              required
                              disabled={isSavingProfile}
                              value={profile.name}
                              onChange={(event) => {
                                const name = event.currentTarget.value
                                setProfileDraft((draft) => ({ ...draft, name }))
                              }}
                            />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="owner-email">อีเมล</Label>
                            <Input
                              id="owner-email"
                              type="email"
                              autoComplete="email"
                              maxLength={254}
                              required
                              disabled={isSavingProfile}
                              value={profile.email}
                              onChange={(event) => {
                                const email = event.currentTarget.value
                                setProfileDraft((draft) => ({ ...draft, email }))
                              }}
                            />
                          </div>
                          <div className="space-y-2 sm:col-span-2">
                            <Label htmlFor="owner-phone">เบอร์โทรศัพท์ <span className="text-muted-foreground">(ไม่บังคับ)</span></Label>
                            <Input
                              id="owner-phone"
                              type="tel"
                              autoComplete="tel"
                              maxLength={40}
                              disabled={isSavingProfile}
                              value={profile.phone ?? ''}
                              onChange={(event) => {
                                const phone = event.currentTarget.value
                                setProfileDraft((draft) => ({ ...draft, phone }))
                              }}
                            />
                          </div>
                        </div>

                        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                          <Button type="button" variant="outline" disabled={isSavingProfile} onClick={cancelProfileChanges}>
                            ยกเลิก
                          </Button>
                          <Button type="submit" disabled={isSavingProfile || Object.keys(profileChanges).length === 0}>
                            {isSavingProfile ? 'กำลังบันทึก...' : 'บันทึกโปรไฟล์'}
                          </Button>
                        </div>
                        {profileFeedback && (
                          <output aria-live="polite" className={profileFeedback.kind === 'error' ? 'text-sm text-danger' : 'text-sm text-link'}>
                            {profileFeedback.message}
                          </output>
                        )}
                      </form>
                    </CardContent>
                  </Card>
                </TabsContent>

                <TabsContent value="preferences" className="space-y-4">
                  <Card>
                    <CardHeader>
                      <CardTitle>การแสดงผล</CardTitle>
                      <CardDescription>ค่าที่บันทึกจะใช้ต่อเมื่อเปิดหน้าเว็บหรือ session ใหม่</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <form className="space-y-6" onSubmit={handlePreferencesSubmit}>
                        <div className="grid gap-4 sm:grid-cols-2">
                          <div className="space-y-2">
                            <Label htmlFor="owner-theme">Theme</Label>
                            <select
                              id="owner-theme"
                              className="surface-inset flex h-10 w-full rounded-md border border-border-strong bg-input px-3 py-2 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
                              disabled={isSavingPreferences}
                              value={preferences.theme}
                              onChange={(event) => {
                                const theme = event.currentTarget.value as SettingsTheme
                                setPreferencesDraft((draft) => ({ ...draft, theme }))
                              }}
                            >
                              {SETTINGS_THEMES.map((theme) => <option key={theme} value={theme}>{themeLabels[theme]}</option>)}
                            </select>
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="owner-locale">ภาษา</Label>
                            <select
                              id="owner-locale"
                              className="surface-inset flex h-10 w-full rounded-md border border-border-strong bg-input px-3 py-2 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
                              disabled={isSavingPreferences}
                              value={preferences.locale}
                              onChange={(event) => {
                                const locale = event.currentTarget.value as SettingsLocale
                                setPreferencesDraft((draft) => ({ ...draft, locale }))
                              }}
                            >
                              {SETTINGS_LOCALES.map((locale) => <option key={locale} value={locale}>{localeLabels[locale]}</option>)}
                            </select>
                            <p className="text-xs text-muted-foreground">บันทึก locale และกำหนด HTML language; ข้อความ UI ปัจจุบันแสดงภาษาไทย</p>
                          </div>
                          <div className="space-y-2 sm:col-span-2">
                            <Label htmlFor="owner-timezone">Timezone ของระบบ</Label>
                            <Input id="owner-timezone" value={preferences.timezone} readOnly aria-readonly="true" />
                            <p className="text-xs text-muted-foreground">ระบบใช้ timezone นี้กับวันที่ การบันทึก และการคำนวณทุกเมนู และไม่สามารถเปลี่ยนได้</p>
                          </div>
                        </div>

                        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                          <Button type="button" variant="outline" disabled={isSavingPreferences} onClick={cancelPreferenceChanges}>
                            ยกเลิก
                          </Button>
                          <Button type="submit" disabled={isSavingPreferences || Object.keys(preferencesChanges).length === 0}>
                            {isSavingPreferences ? 'กำลังบันทึก...' : 'บันทึกการตั้งค่า'}
                          </Button>
                        </div>
                        {preferencesFeedback && (
                          <output aria-live="polite" className={preferencesFeedback.kind === 'error' ? 'text-sm text-danger' : 'text-sm text-link'}>
                            {preferencesFeedback.message}
                          </output>
                        )}
                      </form>
                    </CardContent>
                  </Card>
                </TabsContent>
              </Tabs>
            )}
          </div>
        </main>
      </SidebarInset>
    </SidebarProvider>
  )
}
