import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'

const require = createRequire(import.meta.url)
const ts = require('typescript')
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')

function load(relativePath, mocks = {}) {
  const source = readFileSync(resolve(root, relativePath), 'utf8')
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText
  const loaded = { exports: {} }
  vm.runInNewContext(output, {
    module: loaded,
    exports: loaded.exports,
    require: (name) => {
      if (name in mocks) return mocks[name]
      if (name in identityModules) return identityModules[name]
      throw new Error(`Unexpected identity import: ${name}`)
    },
    Buffer,
    console,
    process,
  }, { filename: relativePath })
  return loaded.exports
}

export const identityModules = {
  'node:crypto': require('node:crypto'),
  'node:fs': { readFileSync: () => '[]' },
  'node:path': require('node:path'),
}

identityModules['@/lib/public-id'] = load('lib/public-id.ts')
identityModules['@/lib/legacy-identity'] = load('lib/legacy-identity.ts')
identityModules['@/lib/opaque-cursor'] = load('lib/opaque-cursor.ts')

export function resolveTestImport(name, mocks) {
  if (name in mocks) return mocks[name]
  if (name in identityModules) return identityModules[name]
  return undefined
}
