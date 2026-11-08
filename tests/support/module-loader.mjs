import { readFileSync, existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'
const require = createRequire(import.meta.url)
const ts = require('typescript')
export const ROOT = fileURLToPath(new URL('../../', import.meta.url))
export function moduleLoader(mocks = {}, globals = {}) {
  const cache = new Map()
  function load(file) {
    file = resolve(ROOT, file)
    if (!existsSync(file) && existsSync(`${file}.ts`)) file += '.ts'
    if (cache.has(file)) return cache.get(file).exports
    if (file.endsWith('.json')) return JSON.parse(readFileSync(file, 'utf8'))
    const loadedModule = { exports: {} }
    cache.set(file, loadedModule)
    const output = ts.transpileModule(readFileSync(file, 'utf8'), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        esModuleInterop: true,
      },
    }).outputText
    vm.runInNewContext(
      output,
      {
        module: loadedModule,
        exports: loadedModule.exports,
        require(name) {
          if (Object.hasOwn(mocks, name)) return mocks[name]
          if (name.startsWith('@/')) return load(name.slice(2))
          if (name.startsWith('.')) return load(resolve(dirname(file), name))
          return require(name)
        },
        Date,
        Error,
        SyntaxError,
        TypeError,
        Intl,
        URL,
        URLSearchParams,
        Buffer,
        AbortController,
        AbortSignal,
        Request,
        Response,
        Headers,
        setTimeout,
        clearTimeout,
        process,
        console: { error() {} },
        fetch: async () => {
          throw new Error('Unexpected real network request')
        },
        ...globals,
      },
      { filename: file },
    )
    return loadedModule.exports
  }
  return load
}
