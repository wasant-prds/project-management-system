import { readFileSync, existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, resolve, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'

export const require = createRequire(import.meta.url)
export const React = require('react')
export const { renderToStaticMarkup } = require('react-dom/server')
const typescript = require('typescript')
export const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')

/** Compile production TSX; mock only the boundaries specified by each case. */
export function createComponentLoader(mocks = {}) {
  const cache = new Map()
  function load(file) {
    const path = resolve(root, file)
    if (cache.has(path)) return cache.get(path).exports
    const module = { exports: {} }
    cache.set(path, module)
    const js = typescript.transpileModule(readFileSync(path, 'utf8'), {
      compilerOptions: { module: typescript.ModuleKind.CommonJS, target: typescript.ScriptTarget.ES2022, jsx: typescript.JsxEmit.ReactJSX, esModuleInterop: true },
    }).outputText
    vm.runInNewContext(js, {
      module, exports: module.exports,
      require: (name) => {
        if (Object.hasOwn(mocks, name)) return mocks[name]?.default ? { __esModule: true, ...mocks[name] } : mocks[name]
        if (name.startsWith('@/') || name.startsWith('.')) {
          const target = name.startsWith('@/') ? resolve(root, name.slice(2)) : resolve(dirname(path), name)
          const mockKey = `@/${relative(root, target).replaceAll('\\', '/')}`
          if (Object.hasOwn(mocks, mockKey)) return mocks[mockKey]
          const candidate = [target, `${target}.ts`, `${target}.tsx`].find((entry) => existsSync(entry))
          if (!candidate) throw new Error(`Missing component import: ${name}`)
          return load(candidate)
        }
        return require(name)
      },
      console, URL, URLSearchParams, Intl,
    }, { filename: path })
    return module.exports
  }
  return load
}

export function descendants(element) {
  if (!React.isValidElement(element)) return []
  return [element, ...React.Children.toArray(element.props.children).flatMap(descendants)]
}

export function textContent(element) {
  if (typeof element === 'string' || typeof element === 'number') return String(element)
  if (!React.isValidElement(element)) return ''
  return React.Children.toArray(element.props.children).map(textContent).join('')
}

export function Link({ href, children, ...props }) {
  return React.createElement('a', { href, ...props }, children)
}
