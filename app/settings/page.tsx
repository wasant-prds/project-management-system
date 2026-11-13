'use client'

import { useState, type FormEvent } from 'react'
import { AppSidebar } from '@/components/layout/app-sidebar'
import { AppHeader } from '@/components/layout/app-header'
import { ContentLoadingSkeleton } from '@/components/layout/content-loading-skeleton'
import { PageState } from '@/components/layout/page-state'
import { loadFailureVisual } from '@/components/ui/product-identity'
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

const themeLabels: Record<SettingsTheme, string> = { light: 'Light', dark: 'Dark', 'special-dark': 'Special Dark' }
const themeDescriptions: Record<SettingsTheme, string> = { light: 'สว่าง อ่านง่าย', dark: 'มืด สบายตา', 'special-dark': 'มืดเข้ม โทนลึก' }
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
              <p className={PAGE_LEAD}>ข้อมูลส่วนตัวและหน้าตาพื้นที่ทำงานของคุณ</p>
            </div>

            {isLoading && <div role="status" aria-busy="true" className="space-y-4"><p className="text-sm text-muted-foreground">กำลังโหลดการตั้งค่า...</p><ContentLoadingSkeleton layout="profile" /></div>}
            {loadError && (
              <PageState kind="error" visual={loadFailureVisual(loadError)} title="โหลดการตั้งค่าไม่สำเร็จ" description={loadError} action={<Button type="button" variant="outline" onClick={reload}>ลองโหลดอีกครั้ง</Button>} />
            )}

            {!isLoading && !loadError && profile && preferences && (
              <Tabs defaultValue="profile" className="cinematic-beat-support min-w-0 gap-5 lg:grid lg:grid-cols-[15rem_minmax(0,1fr)] lg:items-start">
                <div className={TAB_SCROLL_CLASS}>
                  <TabsList aria-label="หมวดการตั้งค่า" className="lg:h-auto lg:w-full lg:flex-col lg:items-stretch lg:gap-2 lg:p-2">
                    <TabsTrigger className={`${TAB_TRIGGER_CLASS} lg:min-h-11 lg:justify-start`} value="profile">โปรไฟล์</TabsTrigger>
                    <TabsTrigger className={`${TAB_TRIGGER_CLASS} lg:min-h-11 lg:justify-start`} value="preferences">การแสดงผล</TabsTrigger>
                  </TabsList>
                </div>

                <TabsContent value="profile" className="space-y-4">
                  <Card>
                    <CardHeader>
                      <CardTitle>โปรไฟล์ของคุณ</CardTitle>
                      <CardDescription>แก้ไขชื่อ อีเมลติดต่อ และโทรศัพท์ได้ที่นี่ โดยไม่เปลี่ยนวิธีเข้าสู่ระบบ</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <form className="space-y-6" onSubmit={handleProfileSubmit}>
                        <div className="flex min-w-0 items-center gap-4 border-b border-border/60 pb-5">
                          <Avatar className="h-14 w-14 shrink-0 border border-border">
                            {profile.avatar && <AvatarImage src={profile.avatar} alt="รูปโปรไฟล์เจ้าของระบบ" />}
                            <AvatarFallback className="bg-primary/10 font-semibold text-link">
                              {getAvatarInitials(profile.name)}
                            </AvatarFallback>
                          </Avatar>
                          <div className="min-w-0"><p className="content-wrap font-semibold">{settings?.profile.name}</p><p className="content-wrap mt-1 text-sm text-muted-foreground">{settings?.profile.email}</p><p className="mt-1 text-xs text-muted-foreground">ใช้รูปที่บันทึกไว้ หรืออักษรย่อจากชื่อ</p></div>
                        </div>

                        <div className="grid min-w-0 gap-4 sm:grid-cols-2 [&>div]:min-w-0">
                          <div className="space-y-2">
                            <Label htmlFor="owner-name">ชื่อที่แสดง <span className="text-muted-foreground">(จำเป็น)</span></Label>
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
                            <Label htmlFor="owner-email">อีเมลติดต่อ <span className="text-muted-foreground">(จำเป็น)</span></Label>
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
                          <Button type="submit" magnetic disabled={isSavingProfile || Object.keys(profileChanges).length === 0}>
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
                      <CardDescription>เลือกหน้าตาที่ต้องการ แล้วกดบันทึกเพื่อใช้กับทุกหน้าและครั้งถัดไป</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <form className="space-y-6" onSubmit={handlePreferencesSubmit}>
                        <fieldset disabled={isSavingPreferences} aria-describedby="theme-draft-hint" className="min-w-0 space-y-3">
                          <legend className="type-section mb-3">ธีมพื้นที่ทำงาน</legend>
                          <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-3">
                            {SETTINGS_THEMES.map((theme) => <label key={theme} className="relative min-w-0 cursor-pointer">
                              <input type="radio" name="owner-theme" id={`owner-theme-${theme}`} aria-label={themeLabels[theme]} value={theme} checked={preferences.theme === theme} disabled={isSavingPreferences} onChange={() => setPreferencesDraft((draft) => ({ ...draft, theme }))} className="peer sr-only" />
                              <span className="motion-control block min-w-0 rounded-xl border-2 border-border bg-card p-3 peer-checked:border-primary peer-focus-visible:outline-2 peer-focus-visible:outline-offset-4 peer-focus-visible:outline-ring peer-disabled:cursor-not-allowed peer-disabled:opacity-60">
                                <span aria-hidden="true" data-theme-preview={theme} className={`${theme === 'light' ? 'theme-preview-light' : theme} mb-3 flex h-24 overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--background)] p-2`}>
                                  <span className="mr-2 flex w-1/4 flex-col gap-2 rounded bg-[var(--surface)] p-2"><span className="h-2 rounded bg-[var(--primary)]" /><span className="h-1 rounded bg-[var(--text-muted)]" /><span className="h-1 rounded bg-[var(--border)]" /></span>
                                  <span className="flex flex-1 flex-col gap-2"><span className="h-2 w-2/3 rounded bg-[var(--text-primary)]" /><span className="grid flex-1 grid-cols-2 gap-2"><span className="rounded border border-[var(--border)] bg-[var(--surface)]" /><span className="rounded border border-[var(--border)] bg-[var(--surface)]" /></span><span className="h-3 w-1/2 rounded bg-[var(--primary)]" /></span>
                                </span>
                                <span className="flex flex-wrap items-center justify-between gap-1 text-sm font-semibold"><span>{themeLabels[theme]}</span><span aria-hidden="true" className="text-xs">{preferences.theme === theme ? '✓ เลือกอยู่' : 'เลือก'}</span></span>
                                <span className="mt-1 block text-xs text-muted-foreground">{themeDescriptions[theme]}</span>
                              </span>
                            </label>)}
                          </div>
                          <p id="theme-draft-hint" className="text-xs text-muted-foreground">ภาพตัวอย่างเท่านั้น ธีมจะเปลี่ยนเมื่อบันทึก · ยกเลิกเพื่อกลับไปใช้ค่าที่บันทึกไว้</p>
                        </fieldset>
                        <div className="grid min-w-0 gap-4 sm:grid-cols-2 [&>div]:min-w-0">
                          <div className="space-y-2">
                            <Label htmlFor="owner-locale">ภาษา</Label>
                            <select
                              id="owner-locale"
                              className="motion-control shadow-input flex h-10 w-full rounded-md border border-border-strong bg-input px-3 py-2 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:border-border disabled:bg-disabled disabled:text-disabled-foreground disabled:opacity-100 disabled:shadow-none"
                              disabled={isSavingPreferences}
                              value={preferences.locale}
                              onChange={(event) => {
                                const locale = event.currentTarget.value as SettingsLocale
                                setPreferencesDraft((draft) => ({ ...draft, locale }))
                              }}
                            >
                              {SETTINGS_LOCALES.map((locale) => <option key={locale} value={locale}>{localeLabels[locale]}</option>)}
                            </select>
                            <p className="text-xs text-muted-foreground">บันทึกภาษาที่ต้องการได้ แต่ข้อความส่วนใหญ่ยังแสดงภาษาไทย</p>
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="owner-timezone">เขตเวลา</Label>
                            <Input id="owner-timezone" value={preferences.timezone} readOnly aria-readonly="true" />
                            <p className="text-xs text-muted-foreground">ทุกเมนูใช้เวลาไทยร่วมกัน เปลี่ยนไม่ได้</p>
                          </div>
                        </div>

                        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                          <Button type="button" variant="outline" disabled={isSavingPreferences} onClick={cancelPreferenceChanges}>
                            ยกเลิก
                          </Button>
                          <Button type="submit" magnetic disabled={isSavingPreferences || Object.keys(preferencesChanges).length === 0}>
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
