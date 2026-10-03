import { spawnSync } from 'node:child_process'

/** Isolate test module state and prevent CPU-heavy UI compilation from delaying another suite's timers. */
export function runTestFiles(files, { reporter = 'spec', spawn = spawnSync } = {}) {
  const result = spawn(process.execPath, ['--test', '--test-concurrency=1', `--test-reporter=${reporter}`, ...files], {
    stdio: 'inherit',
    env: process.env,
  })
  if (result.error) throw result.error
  return result.status ?? 1
}
