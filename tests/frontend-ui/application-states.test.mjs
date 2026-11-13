import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { createComponentLoader, Link, React, renderToStaticMarkup } from './component-runtime.mjs'

// Issue #53: shared application states, route fallbacks and Login presentation.
const load = createComponentLoader({ 'next/link': { default: Link } })
const render = (Component, props) => renderToStaticMarkup(React.createElement(Component, props))
const source = (path) => readFileSync(new URL(path, import.meta.url), 'utf8')
const { PageState, InlineState } = load('components/layout/page-state.tsx')

test('TC-53-04 state glyphs name the reason so no records, no matches and offline look different', () => {
  const glyph = (props) => render(PageState, { title: 'สถานะ', ...props }).match(/lucide-([a-z-]+)/)?.[1]
  const glyphs = {
    records: glyph({}),
    search: glyph({ visual: 'search' }),
    activity: glyph({ visual: 'activity' }),
    chart: glyph({ visual: 'chart' }),
    network: glyph({ kind: 'error', visual: 'network' }),
    notFound: glyph({ visual: 'not-found' }),
    permission: glyph({ visual: 'permission' }),
  }
  assert.equal(new Set(Object.values(glyphs)).size, Object.keys(glyphs).length, JSON.stringify(glyphs))
  assert.match(render(PageState, { kind: 'loading', title: 'กำลังโหลด', visual: 'search' }), /data-visual="loading"[\s\S]*motion-safe:animate-spin/)
  assert.match(render(InlineState, { visual: 'search', title: 'ไม่พบ' }), /lucide-search-x/)
})

test('TC-53-05 raw browser transport errors become actionable Thai guidance while server messages stay', () => {
  const network = render(PageState, { kind: 'error', visual: 'network', title: 'โหลดไม่สำเร็จ', description: 'Failed to fetch' })
  assert.match(network, /ตรวจการเชื่อมต่อแล้วลองใหม่/)
  assert.doesNotMatch(network, /Failed to fetch/)
  assert.match(network, /role="alert"/)
  const inline = render(InlineState, { kind: 'error', visual: 'network', title: 'โหลดตัวกรองไม่สำเร็จ', description: 'NetworkError when attempting to fetch resource.' })
  assert.doesNotMatch(inline, /NetworkError/)
  const server = render(PageState, { kind: 'error', visual: 'error', title: 'โหลดไม่สำเร็จ', description: 'Project ถูกล็อกชั่วคราว' })
  assert.match(server, /Project ถูกล็อกชั่วคราว/)
})

test('TC-53-06 section density fits cards and tab panels; actions wrap on phones and sit in a row on wider screens', () => {
  const page = render(PageState, { title: 'ว่าง', action: React.createElement('button', { type: 'button' }, 'ไปต่อ') })
  const section = render(PageState, { title: 'ว่าง', density: 'section' })
  assert.match(page, /data-density="page"[^>]*px-5 py-10/)
  assert.match(section, /data-density="section"[^>]*px-4 py-6/)
  assert.match(section, /type-card-title content-wrap max-w-full/)
  assert.match(page, /data-slot="page-state-action" class="[^"]*flex-col[^"]*sm:flex-row/)
  const inline = render(InlineState, { title: 'ว่าง', action: React.createElement('button', { type: 'button' }, 'ไปต่อ') })
  assert.match(inline, /basis-48/)
  assert.match(inline, /data-slot="inline-state-action"/)
})

test('TC-53-07 route fallbacks own the page heading and offer recovery without diagnostics', () => {
  const { ApplicationState } = load('components/layout/application-state.tsx')
  const missing = render(ApplicationState, { kind: 'not-found' })
  assert.match(missing, /<h1 class="type-section content-wrap max-w-full">ไม่พบหน้าที่ต้องการ<\/h1>/)
  assert.match(missing, /href="\/"/)
  assert.match(missing, /href="\/projects"/)
  assert.doesNotMatch(missing, /ลองอีกครั้ง/)
  const failed = render(ApplicationState, { kind: 'error', onRetry() {} })
  assert.match(failed, /<h1[^>]*>ไม่สามารถแสดงหน้านี้ได้<\/h1>/)
  assert.match(failed, /ลองอีกครั้ง/)
  assert.doesNotMatch(failed, /href="\/projects"/)
})

test('TC-53-08 an empty Board announces once, explains filters and keeps them instead of clearing silently', () => {
  const page = source('../../app/board/page.tsx')
  assert.match(page, /workItems\.length === 0 && \(\s*<InlineState live/)
  assert.match(page, /activeFilterCount > 0 \? 'ไม่พบ Work Item ที่ตรงกับตัวกรอง'/)
  assert.match(page, /ตัวกรองยังคงอยู่/)
  assert.match(page, /onClick=\{\(\) => setFilters\(INITIAL_FILTERS\)\}>คืนค่าตัวกรอง/)
  // Individual empty columns stay silent so assistive technology hears one summary.
  assert.match(page, /<p className="px-2 py-4 text-center text-xs text-muted-foreground">ยังไม่มี Work Item ในสถานะนี้/)
  assert.equal((page.match(/<InlineState live/g) ?? []).length, 1)
})

test('TC-53-09 Login keeps the #45 contract and only refines presentation', () => {
  const screen = source('../../components/auth/login-screen.tsx')
  for (const contract of [
    /fetch\('\/api\/auth\/login'/, /credentials: 'same-origin'/, /autoComplete="username"/, /autoComplete="current-password"/,
    /window\.location\.replace\(result\.redirectTo\)/, /role="alert" tabIndex=\{-1\}/, /aria-busy=\{isSubmitting\}/,
    /aria-pressed=\{showPassword\}/, /<fieldset disabled=\{isSubmitting\}>/,
  ]) assert.match(screen, contract)
  const css = source('../../app/login/login.css')
  for (const rule of [/\.login-brand-caption \{[^}]*font-size: 10px[^}]*var\(--text-secondary\)/, /\.login-card-heading > p:last-child \{[^}]*var\(--text-secondary\)/, /\.login-private-label \{[^}]*var\(--text-secondary\)/]) assert.match(css, rule)
  assert.match(css, /@media \(max-width: 480px\)[^\n]*\.login-brand-caption \{ display: none; \}/)
  assert.match(css, /@media \(max-width: 360px\)/)
  assert.match(css, /@media \(max-height: 700px\) and \(min-width: 861px\) \{ \.login-workspace \{ display: none; \}/)
  assert.match(css, /@media \(prefers-reduced-motion: reduce\) \{ \.login-card \{ animation: none; \}/)
  // No secondary text below 9px remains outside the decorative, aria-hidden illustration.
  const outsideIllustration = css.split('\n').filter((line) => !/login-(column-label|focus-card|board|mini|skeleton)/.test(line))
  for (const line of outsideIllustration) for (const [, size] of line.matchAll(/font-size: (\d+)px/g)) assert.ok(Number(size) >= 9, line)
})
