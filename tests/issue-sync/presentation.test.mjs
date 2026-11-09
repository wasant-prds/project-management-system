import test from 'node:test'
import assert from 'node:assert/strict'
import {
  createComponentLoader,
  descendants,
  textContent,
  React,
  renderToStaticMarkup,
} from '../frontend-ui/component-runtime.mjs'
import { loader } from './support.mjs'

test('synced label fields render as the Work Item detail badges shown in the requested format', () => {
  const pass = (tag) =>
    function Element({ children }) {
      return React.createElement(tag, null, children)
    }
  const load = createComponentLoader({
    '@/components/ui/dialog': {
      Dialog: pass('div'),
      DialogContent: pass('section'),
      DialogHeader: pass('header'),
      DialogTitle: pass('h2'),
      DialogDescription: pass('p'),
      DialogFooter: pass('footer'),
    },
    '@/components/page/work-items/work-item-description': {
      WorkItemDescription: ({ text }) => React.createElement('p', null, text),
    },
  })
  const { syncedIssueFields } = loader()('lib/integrations/issue-content.ts')
  const { WorkItemViewDialog } = load('components/page/work-items/work-item-view-dialog.tsx')
  const { fields } = syncedIssueFields(
    {
      number: '5',
      title: '[SA] DHAS Grand Rally',
      description: 'Details',
      status: 'completed',
      labels: ['type::task', 'priority::high', 'role::SA', 'type::documentation', 'team::sales'],
    },
    {},
  )
  const html = renderToStaticMarkup(
    React.createElement(WorkItemViewDialog, {
      open: true,
      item: {
        ...fields,
        id: '10000000-0000-4000-8000-000000000001',
        project: { name: 'DHAS', company: { name: 'Dhas' } },
        assignee: { name: 'Owner' },
        timeEntries: [],
      },
      onOpenChange() {},
      onEdit() {},
    }),
  )
  for (const label of [
    '[#5] [SA] DHAS Grand Rally',
    'Task',
    'Completed',
    'High',
    'System Analyst',
    'documentation',
    'team::sales',
  ])
    assert.ok(html.includes(label), label)
  assert.doesNotMatch(html, /type::task|priority::high|role::SA|type::documentation/)
})

test('editing imported custom labels permits deselection and reselection in the same dialog', () => {
  let form
  const load = createComponentLoader({
    react: {
      ...React,
      useEffect() {},
      useState(initial) {
        if (typeof initial !== 'object') return [initial, () => {}]
        form ??= initial
        return [
          form,
          (next) => {
            form = typeof next === 'function' ? next(form) : next
          },
        ]
      },
    },
  })
  const { WorkItemDialog } = load('components/page/work-items/work-item-dialog.tsx')
  const props = {
    open: true,
    mode: 'edit',
    projects: [],
    initialValues: {
      title: 'Synced',
      types: ['team::sales'],
      kind: 'Task',
      status: 'todo',
      priority: 'high',
      role: 'SA',
      projectId: '',
      workDate: '',
      dueDate: '',
    },
    onOpenChange() {},
    onSaved() {},
  }
  const customLabel = () =>
    descendants(WorkItemDialog(props)).find(
      (node) => node.props.onClick && textContent(node) === 'team::sales',
    )
  customLabel().props.onClick()
  assert.deepEqual([...form.types], [])
  assert.ok(customLabel(), 'an unchecked imported label must remain available')
  customLabel().props.onClick()
  assert.deepEqual([...form.types], ['team::sales'])
})
