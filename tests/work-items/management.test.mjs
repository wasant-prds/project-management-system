import test from 'node:test'
import assert from 'node:assert/strict'
import { moduleLoader } from '../support/module-loader.mjs'
const loadTs = (path, mocks = {}, globals = {}) => moduleLoader(mocks, globals)(path.replace(/^\.\.\/\.\.\//, ''))
const PROJECT_1 = '33333333-3333-4333-8333-333333333333'
const owner = { id:'11111111-1111-4111-8111-111111111111' }
const validInput = (overrides = {}) => ({
  title: 'Fix the workflow',
  projectId: PROJECT_1,
  kind: 'Issue',
  status: 'todo',
  priority: 'high',
  role: 'Developer',
  types: ['bug'],
  workDate: '2026-09-30',
  dueDate: '2026-10-02',
  ...overrides,
})


test('shared input parser accepts Bangkok calendar dates and rejects invalid calendar days', () => {
  const system = { parser: loadTs('../../lib/work-item-input.ts') }
  const parsed = system.parser.parseWorkItemInput(validInput(), owner.id)
  assert.equal('error' in parsed, false)
  assert.equal(parsed.data.workDate.toISOString(), '2026-09-30T00:00:00.000Z')
  assert.equal(parsed.data.dueDate.toISOString(), '2026-10-02T00:00:00.000Z')

  const patch = system.parser.parseWorkItemPatch({
    kind: 'Task',
    status: 'pm-testing',
    priority: 'urgent',
    role: '',
    types: ['feature'],
  }, owner.id)
  assert.equal(patch.data.kind, 'Task')
  assert.equal(patch.data.status, 'pm-testing')
  assert.equal(patch.data.priority, 'urgent')
  assert.equal(patch.data.role, null)
  assert.deepEqual([...patch.data.types], ['feature'])
  assert.match(system.parser.parseWorkItemInput(validInput({ workDate: '2026-02-30' }), owner.id).error, /YYYY-MM-DD/)
  assert.match(system.parser.parseWorkItemInput(validInput({ kind: 'Defect' }), owner.id).error, /kind/)
  assert.match(system.parser.parseWorkItemPatch({ kind: 'Defect' }, owner.id).error, /kind/)
  assert.match(system.parser.parseWorkItemPatch({ status: 'unknown' }, owner.id).error, /status/)
  assert.match(system.parser.parseWorkItemPatch({ priority: 'critical' }, owner.id).error, /priority/)
  assert.match(system.parser.parseWorkItemPatch({ role: 'manager' }, owner.id).error, /role/)
  assert.match(system.parser.parseWorkItemPatch({ types: ['unknown'] }, owner.id).error, /types/)
  assert.match(system.parser.parseWorkItemPatch({ dueDate: {} }, owner.id).error, /YYYY-MM-DD/)
})

test('shared input validation rejects malformed bodies, missing fields, foreign assignees, and ID changes', () => {
  const system = { parser: loadTs('../../lib/work-item-input.ts') }
  assert.match(system.parser.parseWorkItemInput(null, owner.id).error, /object/)
  assert.match(system.parser.parseWorkItemInput([], owner.id).error, /object/)
  assert.match(system.parser.parseWorkItemInput({ projectId: PROJECT_1 }, owner.id).error, /required/)
  assert.match(system.parser.parseWorkItemInput(validInput({ title: '   ' }), owner.id).error, /required/)
  assert.match(system.parser.parseWorkItemInput(validInput({ projectId: '   ' }), owner.id).error, /required/)
  assert.match(system.parser.parseWorkItemInput(validInput({ assigneeId: 'foreign-owner' }), owner.id).error, /authenticated owner/)
  assert.match(system.parser.parseWorkItemPatch({ id: 'replacement-id' }, owner.id).error, /cannot be updated/)
})
