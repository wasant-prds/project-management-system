import test from 'node:test'
import assert from 'node:assert/strict'
import { moduleLoader } from '../support/module-loader.mjs'
function health(ready, failure) {
  return moduleLoader({ '@/lib/database/client': { database: { one: async () => { if (failure) throw new Error('sensitive SQL diagnostic'); return { ready } } } } })('app/api/health/route.ts').GET()
}
test('health requires the current SQL schema and timezone',async () => {
  assert.equal((await health(true)).status,200)
  assert.equal((await health(false)).status,503)
})
test('health never discloses database diagnostics',async () => {
  const response=await health(false,true)
  assert.equal(response.status,503)
  assert.doesNotMatch(JSON.stringify(await response.json()),/sensitive|SQL/)
})
