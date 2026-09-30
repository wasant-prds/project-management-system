import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { parseEnv } from 'node:util'
import { config, sql, verifyRollout } from './db-rollout.mjs'

async function main() {
  const [command, environment, archive] = process.argv.slice(2)
  if (command !== '--apply' || !environment || !archive) {
    throw new Error('Usage: node scripts/company-project-schema.mjs --apply <environment> <verified-archive>')
  }
  const rootEnv = parseEnv(await readFile(new URL('../.env', import.meta.url), 'utf8'))
  const settings = config(rootEnv)
  if (settings.site !== environment) throw new Error('APP_ENV does not match requested environment')
  await verifyRollout(settings, archive, 'baseline')
  const statement = await readFile(new URL('./company-project-additive.sql', import.meta.url), 'utf8')
  sql(settings.container, statement)
  console.log('Company/Project additive schema applied; run rollout additive verification.')
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main()
