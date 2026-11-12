'use client'

import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useTheme } from 'next-themes'
import {
  ArrowRight, Check, CheckCheck, CircleAlert, Eye, EyeOff, FolderKanban,
  LayoutGrid, ListTodo, LoaderCircle, LockKeyhole, Moon, ShieldCheck,
  Sparkles, Sun, UserRound,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

const themes = [
  { value: 'light', label: 'ธีมสว่าง', icon: Sun },
  { value: 'dark', label: 'ธีมมืด', icon: Moon },
  { value: 'special-dark', label: 'ธีมมืดพิเศษ', icon: Sparkles },
] as const

function LoginThemeSwitch() {
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  return (
    <div className="login-theme-switch" role="group" aria-label="เลือกธีมการแสดงผล">
      {themes.map(({ value, label, icon: Icon }) => (
        <button
          key={value}
          type="button"
          aria-label={label}
          title={label}
          aria-pressed={mounted && theme === value}
          onClick={() => setTheme(value)}
        >
          <Icon size={16} strokeWidth={1.75} aria-hidden="true" />
        </button>
      ))}
    </div>
  )
}

function WorkspaceIllustration() {
  return (
    <div className="login-workspace" aria-hidden="true">
      <div className="login-orbit login-orbit-outer" />
      <div className="login-orbit login-orbit-inner" />
      <div className="login-board">
        <div className="login-board-header">
          <span className="login-board-symbol"><LayoutGrid size={15} strokeWidth={1.75} /></span>
          <span>My workspace</span>
          <span className="login-board-dots"><i /><i /><i /></span>
        </div>
        <div className="login-board-columns">
          <div className="login-board-column">
            <span className="login-column-label"><i />To do</span>
            <div className="login-mini-card"><span className="login-mini-tag" /><span className="login-skeleton login-skeleton-long" /><span className="login-skeleton" /><span className="login-mini-avatar" /></div>
            <div className="login-mini-card login-mini-card-short"><span className="login-skeleton login-skeleton-long" /><span className="login-skeleton" /></div>
          </div>
          <div className="login-board-column">
            <span className="login-column-label"><i />In progress</span>
            <div className="login-mini-card"><span className="login-mini-tag login-mini-tag-blue" /><span className="login-skeleton login-skeleton-long" /><span className="login-skeleton" /><div className="login-mini-progress"><span /></div></div>
          </div>
          <div className="login-board-column">
            <span className="login-column-label"><i />Done</span>
            <div className="login-mini-card"><span className="login-mini-tag login-mini-tag-green" /><span className="login-skeleton login-skeleton-long" /><span className="login-skeleton" /><span className="login-mini-complete"><CheckCheck size={14} /></span></div>
          </div>
        </div>
      </div>
      <div className="login-focus-card">
        <span className="login-focus-icon"><Check size={21} strokeWidth={2} /></span>
        <span><strong>อีกหนึ่งก้าวของความสำเร็จ</strong><span>เปลี่ยนแผนที่วางไว้ ให้กลายเป็นงานที่สำเร็จ</span></span>
      </div>
      <span className="login-workspace-spark"><Sparkles size={21} strokeWidth={1.5} /></span>
    </div>
  )
}

export function LoginScreen() {
  const [showPassword, setShowPassword] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const submitting = useRef(false)
  const errorRef = useRef<HTMLDivElement>(null)

  useEffect(() => { if (error) errorRef.current?.focus() }, [error])

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (submitting.current) return
    const form = new FormData(event.currentTarget)
    submitting.current = true
    setIsSubmitting(true)
    setError(null)
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({
          username: form.get('username'),
          password: form.get('password'),
          next: new URLSearchParams(window.location.search).get('next'),
        }),
      })
      if (!response.ok) {
        if (response.status === 429) throw new Error('ลองเข้าสู่ระบบบ่อยเกินไป กรุณารอสักครู่แล้วลองใหม่')
        if (response.status === 401) throw new Error('ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง กรุณาตรวจสอบแล้วลองอีกครั้ง')
        throw new Error('ยังเข้าสู่ระบบไม่ได้ กรุณาลองใหม่อีกครั้ง')
      }
      const result: unknown = await response.json()
      if (!result || typeof result !== 'object' || !('redirectTo' in result) || typeof result.redirectTo !== 'string') {
        throw new Error('ยังเข้าสู่ระบบไม่ได้ กรุณาลองใหม่อีกครั้ง')
      }
      window.location.replace(result.redirectTo)
    } catch (failure) {
      setError(failure instanceof TypeError ? 'เชื่อมต่อระบบไม่ได้ กรุณาตรวจสอบการเชื่อมต่อแล้วลองใหม่' : failure instanceof Error ? failure.message : 'ยังเข้าสู่ระบบไม่ได้ กรุณาลองใหม่อีกครั้ง')
      submitting.current = false
      setIsSubmitting(false)
    }
  }

  return (
    <div className="login-page">
      <header className="login-header">
        <div className="login-brand" aria-label="ProjectHub">
          <span className="login-brand-icon"><FolderKanban size={23} strokeWidth={1.75} aria-hidden="true" /></span>
          <span>ProjectHub<span className="login-brand-caption">YOUR PERSONAL WORKSPACE</span></span>
        </div>
        <LoginThemeSwitch />
      </header>

      <main className="login-main">
        <section className="login-story" aria-labelledby="login-story-title">
          <span className="login-eyebrow"><span />A LITTLE CLARITY. A LOT OF PROGRESS.</span>
          <h2 id="login-story-title">ทุกโปรเจกต์<span className="login-story-accent">ชัดเจน</span><br />ทุกวันมีทิศทาง<span className="login-title-dot">.</span></h2>
          <p className="login-story-description">จัดระเบียบงาน เชื่อมต่อทุกความคืบหน้า<br />แล้วมีเวลาโฟกัสกับสิ่งที่สำคัญจริง ๆ</p>
          <WorkspaceIllustration />
          <div className="login-story-features">
            <span><FolderKanban size={16} strokeWidth={1.75} aria-hidden="true" />จัดการโปรเจกต์</span>
            <span><ListTodo size={16} strokeWidth={1.75} aria-hidden="true" />ติดตามงาน</span>
            <span><LayoutGrid size={16} strokeWidth={1.75} aria-hidden="true" />เห็นภาพรวม</span>
          </div>
        </section>

        <section className="login-card" aria-labelledby="login-title">
          <div className="login-card-topline"><span className="login-lock-well"><LockKeyhole size={24} strokeWidth={1.5} aria-hidden="true" /></span><span className="login-private-label"><span />PRIVATE WORKSPACE</span></div>
          <div className="login-card-heading">
            <p className="login-card-eyebrow">WELCOME BACK</p>
            <h1 id="login-title">ยินดีต้อนรับกลับมา</h1>
            <p>เข้าสู่ระบบ เพื่อเริ่มต้นวันทำงานของคุณ</p>
          </div>

          <form onSubmit={handleSubmit} className="login-form" aria-busy={isSubmitting}>
            {error && <div className="login-error" id="login-error" role="alert" tabIndex={-1} ref={errorRef}><CircleAlert size={18} aria-hidden="true" /><span>{error}</span></div>}
            <fieldset disabled={isSubmitting}>
              <div className="login-field">
                <Label htmlFor="login-username">ชื่อผู้ใช้ <span>Username</span></Label>
                <div className="login-input-wrap">
                  <UserRound size={18} strokeWidth={1.65} aria-hidden="true" />
                  <Input id="login-username" name="username" type="text" autoComplete="username" autoCapitalize="none" spellCheck={false} maxLength={256} required placeholder="กรอกชื่อผู้ใช้ของคุณ" aria-describedby={error ? 'login-error' : undefined} aria-invalid={error ? true : undefined} />
                </div>
              </div>
              <div className="login-field">
                <Label htmlFor="login-password">รหัสผ่าน <span>Password</span></Label>
                <div className="login-input-wrap">
                  <LockKeyhole size={18} strokeWidth={1.65} aria-hidden="true" />
                  <Input id="login-password" name="password" type={showPassword ? 'text' : 'password'} autoComplete="current-password" maxLength={4096} required placeholder="กรอกรหัสผ่านของคุณ" aria-describedby={error ? 'login-error' : undefined} aria-invalid={error ? true : undefined} />
                  <button type="button" className="login-password-toggle" aria-label={showPassword ? 'ซ่อนรหัสผ่าน' : 'แสดงรหัสผ่าน'} aria-pressed={showPassword} aria-controls="login-password" onClick={() => setShowPassword(!showPassword)}>{showPassword ? <EyeOff size={18} strokeWidth={1.65} aria-hidden="true" /> : <Eye size={18} strokeWidth={1.65} aria-hidden="true" />}</button>
                </div>
              </div>
              <Button type="submit" className="login-submit" disabled={isSubmitting}>
                {isSubmitting ? <><LoaderCircle size={18} className="animate-spin motion-reduce:animate-none" aria-hidden="true" /><span>กำลังเข้าสู่ระบบ…</span></> : <><span>เข้าสู่พื้นที่ทำงาน</span><ArrowRight size={18} strokeWidth={1.75} aria-hidden="true" /></>}
              </Button>
            </fieldset>
          </form>

          <div className="login-card-footer"><ShieldCheck size={17} strokeWidth={1.65} aria-hidden="true" /><p>พื้นที่ส่วนตัวของคุณ<span>เข้าใช้งานด้วยบัญชีเจ้าของระบบ</span></p></div>
        </section>
      </main>

      <footer className="login-footer"><span>ProjectHub <span className="login-footer-divider">/</span> Make space for meaningful work.</span><span><LockKeyhole size={12} aria-hidden="true" /> Your workspace. Your focus.</span></footer>
    </div>
  )
}
