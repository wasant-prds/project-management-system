import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import test from 'node:test'
import vm from 'node:vm'

const require = createRequire(import.meta.url)
const typescript = require('typescript')

function deferred() {
  let resolve
  let reject
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

function createReactRuntime() {
  const states = new Map()
  const refs = new Map()
  let index = 0
  const effects = []
  return {
    effects,
    createContext: () => ({ Provider: function Provider() {} }),
    useContext: (context) => context.value,
    useEffect: (effect) => effects.push(effect),
    useRef(initial) {
      const slot = index++
      if (!refs.has(slot)) refs.set(slot, { current: initial })
      return refs.get(slot)
    },
    useState(initial) {
      const slot = index++
      if (!states.has(slot)) states.set(slot, typeof initial === 'function' ? initial() : initial)
      return [states.get(slot), (next) => states.set(slot, typeof next === 'function' ? next(states.get(slot)) : next)]
    },
    render(Provider) {
      index = 0
      return Provider({ children: null })
    },
  }
}

function loadProvider({ fetcher, themeChanges, document }) {
  const react = createReactRuntime()
  const source = readFileSync(new URL('../../components/layout/owner-settings-provider.tsx', import.meta.url), 'utf8')
  const output = typescript.transpileModule(source, {
    compilerOptions: { module: typescript.ModuleKind.CommonJS, target: typescript.ScriptTarget.ES2022, jsx: typescript.JsxEmit.ReactJSX },
  }).outputText
  const loadedModule = { exports: {} }
  vm.runInNewContext(output, {
    module: loadedModule,
    exports: loadedModule.exports,
    require: (name) => {
      if (name === 'react') return { ...react, createContext: (initialValue) => ({ ...react.createContext(), value: initialValue }) }
      if (name === 'react/jsx-runtime') return { jsx: (type, props) => ({ type, props }) }
      if (name === 'next-themes') return { useTheme: () => ({ setTheme: (theme) => themeChanges.push(theme) }) }
      throw new Error(`Unexpected import: ${name}`)
    },
    fetch: fetcher,
    document,
    console,
    Error,
  }, { filename: 'components/layout/owner-settings-provider.tsx' })
  return { ...react, OwnerSettingsProvider: loadedModule.exports.OwnerSettingsProvider }
}

function response(settings, ok = true) {
  return { ok, json: async () => settings }
}

const lightSettings = {
  profile: { name: 'Owner', email: 'owner@example.test', phone: null, avatar: null },
  preferences: { theme: 'light', locale: 'th', timezone: 'Asia/Bangkok' },
}

test('COLOR-09 Dark to Light saves only the preference and a new provider restores the confirmed theme', async () => {
  let stored = { ...lightSettings, preferences: { ...lightSettings.preferences, theme: 'dark' } }
  const themeChanges = []
  const document = { documentElement: { lang: 'th' } }
  const requests = []
  const fetcher = async (path, init = {}) => {
    requests.push({ path, init })
    if (init.method === 'PATCH') {
      const body = JSON.parse(init.body)
      assert.deepEqual(body, { preferences: { theme: 'light' } })
      stored = { ...stored, preferences: { ...stored.preferences, ...body.preferences } }
    }
    return response(stored)
  }
  const runtime = loadProvider({ fetcher, themeChanges, document })
  runtime.render(runtime.OwnerSettingsProvider)
  const cleanup = runtime.effects[0]()
  await new Promise((resolve) => setImmediate(resolve))
  let tree = runtime.render(runtime.OwnerSettingsProvider)
  assert.equal(tree.props.value.settings.preferences.theme, 'dark')
  await tree.props.value.savePreferences({ theme: 'light' })
  tree = runtime.render(runtime.OwnerSettingsProvider)
  assert.equal(tree.props.value.settings.preferences.theme, 'light')
  assert.deepEqual(JSON.parse(JSON.stringify(tree.props.value.settings.profile)), lightSettings.profile)
  assert.equal(tree.props.value.settings.preferences.timezone, 'Asia/Bangkok')
  cleanup()

  const restored = loadProvider({ fetcher, themeChanges, document })
  restored.render(restored.OwnerSettingsProvider)
  const restoredCleanup = restored.effects[0]()
  await new Promise((resolve) => setImmediate(resolve))
  assert.equal(restored.render(restored.OwnerSettingsProvider).props.value.settings.preferences.theme, 'light')
  assert.deepEqual(themeChanges, ['dark', 'light', 'light'])
  assert.equal(requests.filter((request) => request.init.method === 'PATCH').length, 1)
  restoredCleanup()
})

test('Owner settings load completes before mutations; confirmed PATCH updates one shared canonical state', async () => {
  const getRequest = deferred()
  const patchRequest = deferred()
  const calls = []
  const themeChanges = []
  const document = { documentElement: { lang: 'th' } }
  const fetcher = async (path, init = {}) => {
    calls.push({ path, init })
    return init.method === 'PATCH' ? patchRequest.promise : getRequest.promise
  }
  const runtime = loadProvider({ fetcher, themeChanges, document })
  let tree = runtime.render(runtime.OwnerSettingsProvider)
  assert.equal(tree.props.value.isLoading, true)
  const cleanup = runtime.effects[0]()
  assert.equal(calls.length, 1)
  assert.deepEqual(JSON.parse(JSON.stringify(calls[0].init)), { cache: 'no-store' })

  await assert.rejects(tree.props.value.savePreferences({ theme: 'dark' }), /กำลังโหลดการตั้งค่า/)
  assert.equal(calls.length, 1)

  getRequest.resolve(response(lightSettings))
  await new Promise((resolve) => setImmediate(resolve))
  tree = runtime.render(runtime.OwnerSettingsProvider)
  assert.equal(tree.props.value.isLoading, false)
  assert.deepEqual(JSON.parse(JSON.stringify(tree.props.value.settings)), lightSettings)
  assert.deepEqual(themeChanges, ['light'])
  assert.equal(document.documentElement.lang, 'th')

  const savePromise = tree.props.value.savePreferences({ theme: 'dark' })
  assert.deepEqual(JSON.parse(calls[1].init.body), { preferences: { theme: 'dark' } })
  tree = runtime.render(runtime.OwnerSettingsProvider)
  assert.equal(tree.props.value.isSavingPreferences, true)
  await assert.rejects(tree.props.value.savePreferences({ theme: 'light' }), /กำลังบันทึกการตั้งค่า/)

  const darkSettings = {
    ...lightSettings,
    preferences: { ...lightSettings.preferences, theme: 'dark' },
  }
  patchRequest.resolve(response(darkSettings))
  await savePromise
  tree = runtime.render(runtime.OwnerSettingsProvider)
  assert.equal(tree.props.value.isSavingPreferences, false)
  assert.deepEqual(JSON.parse(JSON.stringify(tree.props.value.settings)), darkSettings)
  assert.deepEqual(themeChanges, ['light', 'dark'])
  assert.equal(calls.length, 2)
  cleanup()
})

test('Owner settings reload blocks writes until its latest GET completes', async () => {
  const firstLoad = deferred()
  const retryLoad = deferred()
  const patchRequest = deferred()
  const calls = []
  const themeChanges = []
  const document = { documentElement: { lang: 'th' } }
  const fetcher = async (path, init = {}) => {
    calls.push({ path, init })
    if (init.method === 'PATCH') return patchRequest.promise
    return calls.filter((call) => call.init.method !== 'PATCH').length === 1 ? firstLoad.promise : retryLoad.promise
  }
  const runtime = loadProvider({ fetcher, themeChanges, document })
  let tree = runtime.render(runtime.OwnerSettingsProvider)
  runtime.effects[0]()
  firstLoad.resolve(response({ error: { message: 'temporary failure' } }, false))
  await new Promise((resolve) => setImmediate(resolve))
  tree = runtime.render(runtime.OwnerSettingsProvider)
  assert.equal(tree.props.value.loadError, 'temporary failure')

  tree.props.value.reload()
  tree = runtime.render(runtime.OwnerSettingsProvider)
  assert.equal(tree.props.value.isLoading, true)
  const nextEffect = runtime.effects.at(-1)
  nextEffect()
  await assert.rejects(tree.props.value.savePreferences({ locale: 'en' }), /กำลังโหลดการตั้งค่า/)
  assert.equal(calls.filter((call) => call.init.method === 'PATCH').length, 0)

  retryLoad.resolve(response(lightSettings))
  await new Promise((resolve) => setImmediate(resolve))
  tree = runtime.render(runtime.OwnerSettingsProvider)
  assert.equal(tree.props.value.loadError, null)
  assert.equal(tree.props.value.isLoading, false)
  assert.equal(calls.filter((call) => call.init.method === 'PATCH').length, 0)
})

test('origin-denied theme save preserves the persisted theme and releases its lock for an authorized retry', async () => {
  const themeChanges = []
  const document = { documentElement: { lang: 'th' } }
  let attempts = 0
  const runtime = loadProvider({ document, themeChanges, fetcher: async (_path, init = {}) => {
    if (init.method !== 'PATCH') return response(lightSettings)
    attempts += 1
    if (attempts === 1) return response({ error: { code: 'ACCESS_DENIED', message: 'ไม่สามารถเข้าถึงระบบได้' } }, false)
    return response({ ...lightSettings, preferences: { ...lightSettings.preferences, theme: 'dark' } })
  } })
  runtime.render(runtime.OwnerSettingsProvider)
  const cleanup = runtime.effects[0]()
  await new Promise((resolve) => setImmediate(resolve))
  let tree = runtime.render(runtime.OwnerSettingsProvider)
  await assert.rejects(tree.props.value.savePreferences({ theme: 'dark' }), /ไม่สามารถเข้าถึงระบบได้/)
  tree = runtime.render(runtime.OwnerSettingsProvider)
  assert.equal(tree.props.value.settings.preferences.theme, 'light')
  assert.equal(tree.props.value.isSavingPreferences, false)
  assert.deepEqual(themeChanges, ['light'])
  await tree.props.value.savePreferences({ theme: 'dark' })
  tree = runtime.render(runtime.OwnerSettingsProvider)
  assert.equal(tree.props.value.settings.preferences.theme, 'dark')
  assert.deepEqual(themeChanges, ['light', 'dark'])
  assert.equal(attempts, 2)
  cleanup()
})
