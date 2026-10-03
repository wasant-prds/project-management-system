import assert from 'node:assert/strict'
import test from 'node:test'
import { runTestFiles } from '../../scripts/unit-test-process.mjs'

test('isolated runner passes literal paths, serial file execution and the selected reporter to Node', () => {
  const files = ['D:/a folder/first.test.mjs', 'D:/a folder/second.test.mjs']
  const status = runTestFiles(files, { reporter: 'tap', spawn(command, args, options) {
    assert.equal(command, process.execPath)
    assert.deepEqual(args, ['--test', '--test-concurrency=1', '--test-reporter=tap', ...files])
    assert.equal(options.stdio, 'inherit')
    assert.equal(options.env, process.env)
    assert.equal(options.shell, undefined)
    return { status: 0 }
  } })
  assert.equal(status, 0)
})

test('isolated runner preserves failures and treats a terminated child as a failed run', () => {
  for (const status of [1, 2]) assert.equal(runTestFiles(['case.test.mjs'], { spawn: () => ({ status }) }), status)
  assert.equal(runTestFiles(['case.test.mjs'], { spawn: () => ({ status: null, signal: 'SIGTERM' }) }), 1)
})

test('isolated runner reports spawn errors instead of claiming that unexecuted tests passed', () => {
  const error = new Error('spawn denied')
  assert.throws(() => runTestFiles(['case.test.mjs'], { spawn: () => ({ error }) }), (caught) => caught === error)
})
