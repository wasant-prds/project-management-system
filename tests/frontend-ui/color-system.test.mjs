import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'
import { createComponentLoader, descendants, textContent, renderToStaticMarkup, React, require, root } from './component-runtime.mjs'

const source = (file) => readFileSync(join(root, file), 'utf8')
const stylesheet = source('app/globals.css')
const postcss = require('postcss')
const css = postcss.parse(stylesheet)
const load = createComponentLoader()
const { buttonVariants, Button } = load('components/ui/button.tsx')
const { Input } = load('components/ui/input.tsx')
const { ProjectIdentity } = load('components/page/work-items/project-identity.tsx')
const { projectAccentStyle, resolveProjectColor, statusClass, priorityClass } = load('components/page/work-items/work-item-presentation.ts')

function palette(selector) {
  const values = new Map()
  css.walkRules((rule) => {
    if (rule.selectors.includes(':root') || rule.selectors.includes(selector)) {
      rule.walkDecls((decl) => values.set(decl.prop, decl.value))
    }
  })
  const resolve = (name, visited = new Set()) => {
    assert.ok(values.has(name), `Missing ${selector} token ${name}`)
    assert.ok(!visited.has(name), `Circular token ${name}`)
    visited.add(name)
    const value = values.get(name)
    const ref = /^var\((--[\w-]+)\)$/.exec(value)
    return ref ? resolve(ref[1], visited) : value
  }
  return resolve
}

function luminance(hex) {
  assert.match(hex, /^#[\da-f]{6}$/i)
  const channels = hex.slice(1).match(/../g).map((value) => Number.parseInt(value, 16) / 255)
    .map((value) => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4)
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722
}

function readable(resolve, text, background, minimum = 4.5) {
  const a = luminance(resolve(text)); const b = luminance(resolve(background))
  const ratio = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)
  assert.ok(ratio >= minimum, `${text} on ${background}: ${ratio.toFixed(2)} < ${minimum}`)
}

function assertThemeSurface(theme) {
  const resolve = palette(theme)
  const surfaces = ['--background', '--background-secondary', '--surface', '--surface-elevated', '--surface-inset', '--surface-hover', '--surface-active', '--selection']
  assert.equal(new Set(surfaces.map((surface) => resolve(surface))).size, surfaces.length)
  for (const surface of surfaces) {
    for (const label of ['--text-primary', '--text-secondary', '--text-muted']) readable(resolve, label, surface)
  }
  for (const status of ['success', 'warning', 'danger', 'info']) readable(resolve, `--${status}`, `--${status}-subtle`)
  readable(resolve, '--text-disabled', '--disabled')
  readable(resolve, '--accent-foreground', '--accent')
}

function assertThemeActions(theme) {
  const resolve = palette(theme)
  for (const action of ['primary', 'destructive', 'success', 'neutral']) {
    const fill = ['success', 'neutral'].includes(action) ? `${action}-solid` : action
    for (const state of [fill, `${action}-hover`, `${action}-active`]) readable(resolve, '--text-inverse', `--${state}`)
  }
  for (const surface of ['--background', '--surface', '--surface-elevated', '--surface-inset', '--surface-hover', '--surface-active']) {
    readable(resolve, '--focus', surface, 3)
    readable(resolve, '--border-strong', surface, 3)
  }
}

test('COLOR-01 :root surface hierarchy and semantic labels meet AA', () => assertThemeSurface(':root'))
test('COLOR-01 .dark surface hierarchy and semantic labels meet AA', () => assertThemeSurface('.dark'))
test('COLOR-01 .special-dark surface hierarchy and semantic labels meet AA', () => assertThemeSurface('.special-dark'))
test('COLOR-02 :root solid action default, hover, pressed and focus remain accessible', () => assertThemeActions(':root'))
test('COLOR-02 .dark solid action default, hover, pressed and focus remain accessible', () => assertThemeActions('.dark'))
test('COLOR-02 .special-dark solid action default, hover, pressed and focus remain accessible', () => assertThemeActions('.special-dark'))

test('COLOR-03 dark palettes use layered low-luminance surfaces and independent neutral shadows', () => {
  const light = palette(':root'); const dark = palette('.dark'); const oled = palette('.special-dark')
  for (const resolve of [dark, oled]) {
    assert.ok(luminance(resolve('--surface-elevated')) > luminance(resolve('--surface')))
    assert.ok(luminance(resolve('--surface')) > luminance(resolve('--background')))
    assert.ok(luminance(resolve('--surface-elevated')) < 0.05)
    for (const shadow of ['soft', 'raised', 'floating', 'inset', 'pressed']) {
      assert.notEqual(resolve(`--shadow-${shadow}`), light(`--shadow-${shadow}`))
      assert.doesNotMatch(resolve(`--shadow-${shadow}`), /var\(--primary\)/)
    }
  }
  assert.notEqual(dark('--background'), oled('--background'))
})

test('COLOR-04 production actions and disabled controls render semantic colors with native semantics', () => {
  for (const variant of ['default', 'info', 'success', 'neutral', 'destructive']) {
    const classes = buttonVariants({ variant })
    assert.match(classes, /hover:bg-[\w-]+-hover/)
    assert.match(classes, /active:bg-[\w-]+-active/)
    assert.doesNotMatch(classes, /text-white|(?:blue|emerald|slate)-\d|bg-primary\/90/)
  }
  const button = renderToStaticMarkup(React.createElement(Button, { disabled: true, 'aria-busy': true }, 'กำลังบันทึก'))
  assert.match(button, /disabled=""/)
  assert.match(button, /aria-busy="true"/)
  assert.match(button, /disabled:bg-disabled/)
  assert.match(button, /disabled:text-disabled-foreground/)
  const input = renderToStaticMarkup(React.createElement(Input, { disabled: true, 'aria-invalid': true, 'aria-label': 'ชื่อ' }))
  assert.match(input, /aria-invalid="true"/)
  assert.match(input, /disabled:text-disabled-foreground/)
})

test('COLOR-05 custom Project colors preserve rails and tints without painting readable names', () => {
  for (const color of ['#fff', '#000000', '#ffff00', 'rgb(240 240 240)', null]) {
    const identity = ProjectIdentity({ name: 'Project Contrast', color })
    const elements = descendants(identity)
    const title = elements.find((element) => element.type === 'p' && textContent(element) === 'Project Contrast')
    assert.match(title.props.className, /text-foreground/)
    assert.equal(title.props.style, undefined)
    const rail = elements.find((element) => element.props['aria-hidden'])
    assert.equal(rail.props.style.backgroundColor, resolveProjectColor(color))
  }
  const shortHex = projectAccentStyle('#abc')
  assert.equal(shortHex.backgroundColor, '#aabbcc18')
  assert.equal(shortHex.borderTint, '#aabbcc33')
  const fallback = projectAccentStyle('  ')
  assert.equal(fallback.color, 'var(--project-accent)')
  assert.equal(fallback.borderTint, 'color-mix(in srgb, var(--project-accent) 20%, transparent)')
  assert.match(projectAccentStyle('rgb(240 240 240)').backgroundColor, /^color-mix\(in srgb, rgb\(240 240 240\) 9%, transparent\)$/)
})

test('COLOR-06 status and priority labels use semantic roles independently of chart series', () => {
  for (const [status, color] of [['completed', 'success'], ['in-progress', 'info'], ['blocked', 'danger'], ['cancelled', 'danger']]) {
    assert.match(statusClass(status), new RegExp(`text-${color}`))
    assert.doesNotMatch(statusClass(status), /chart-/)
  }
  assert.match(priorityClass('medium'), /text-warning/)
  assert.match(priorityClass('urgent'), /text-destructive-foreground/)
})

test('COLOR-07 compiled dark states follow the explicit class, including special-dark, rather than OS preference', async () => {
  const compiled = await postcss([require('@tailwindcss/postcss')()]).process(stylesheet, { from: join(root, 'app/globals.css') })
  assert.match(compiled.css, /:where\(\.dark, \.dark \*, \.special-dark, \.special-dark \*\)/)
  assert.doesNotMatch(compiled.css, /@media\s*\(prefers-color-scheme:\s*dark\)/)
  assert.match(compiled.css, /background-color:\s*var\(--primary-hover\)/)
  assert.match(compiled.css, /background-color:\s*var\(--primary-active\)/)
})

test('COLOR-08 app components contain no arbitrary UI palettes outside the Recharts adapter', () => {
  function files(directory) {
    return readdirSync(join(root, directory), { withFileTypes: true }).flatMap((entry) => {
      const path = join(directory, entry.name)
      return entry.isDirectory() ? files(path) : /\.(tsx?|css)$/.test(path) ? [path] : []
    })
  }
  for (const path of [...files('app'), ...files('components')]) {
    if (path.endsWith('globals.css') || path.endsWith(join('ui', 'chart.tsx'))) continue
    assert.doesNotMatch(source(path), /(?:bg|text|border|ring)-(?:blue|red|emerald|amber|slate|green|orange|teal|purple|cyan|indigo)-\d/, path)
    assert.doesNotMatch(source(path), /#[\da-f]{3,8}\b|hsl\(var\(/i, path)
  }
})
