import assert from 'node:assert/strict'
import test from 'node:test'
import { createComponentLoader, descendants, textContent, React } from '../frontend-ui/component-runtime.mjs'
import { uuid } from './support.mjs'

async function setup(configs = []) {
  const states = [], effects = [], requests = []
  let cursor = 0
  const load = createComponentLoader({
    react: {
      ...React,
      useState(initial) {
        const index = cursor++
        if (!(index in states)) states[index] = initial
        return [states[index], (next) => { states[index] = typeof next === 'function' ? next(states[index]) : next }]
      },
      useRef: (current) => ({ current }),
      useEffect: (operation) => { if (!effects.length) effects.push(operation) },
      useCallback: (operation) => operation,
      useId: () => 'source',
    },
  }, {
    fetch: async (url, options) => {
      requests.push({ url, ...options })
      return new Response(JSON.stringify({ configs, legacyMappings: [] }))
    },
  })
  const { ProjectIssueSync } = load('components/page/projects/project-issue-sync.tsx')
  const render = () => {
    cursor = 0
    return descendants(ProjectIssueSync({ projectId: uuid(20), onSynced() {} }))
  }
  const field = (name) => render().find((node) => node.props.id === `source-${name}`)
  const selectProvider = (provider) => render().find((node) => node.props.onValueChange && ['gitlab', 'github'].includes(node.props.value)).props.onValueChange(provider)
  const click = (label) => render().find((node) => node.props.onClick && textContent(node) === label).props.onClick()
  render()
  effects[0]()
  await new Promise(setImmediate)
  return { render, field, selectProvider, click, requests }
}

test('new issue sources apply editable provider defaults, leave project path blank and save user changes', async () => {
  const { render, field, selectProvider, click, requests } = await setup()
  click('เพิ่มแหล่ง Issues')
  const check = (instance, token, assignees) => {
    for (const [name, expected] of Object.entries({ instance, 'token-env': token, assignees, source: '' })) {
      assert.equal(field(name).props.value, expected)
      assert.equal(field(name).props.disabled, false)
    }
  }
  check('https://gitlab.dhas.com', 'GITLAB_DHAS_TOKEN', 'wasant_p')
  field('source').props.onChange({ target: { value: 'team/old' } })
  selectProvider('github')
  check('https://github.com', 'GITHUB_PRDS_TOKEN', 'wasant-prds')
  selectProvider('gitlab')
  check('https://gitlab.dhas.com', 'GITLAB_DHAS_TOKEN', 'wasant_p')
  for (const [name, value] of Object.entries({ instance: 'https://gitlab.example.test', 'token-env': 'GITLAB_TEAM_TOKEN', assignees: 'alice, bob', source: 'team/new' })) {
    field(name).props.onChange({ target: { value } })
  }
  await render().find((node) => node.type === 'form').props.onSubmit({ preventDefault() {} })
  assert.deepEqual(JSON.parse(requests.find((request) => request.method === 'POST').body), {
    provider: 'gitlab', instanceUrl: 'https://gitlab.example.test', tokenEnvVar: 'GITLAB_TEAM_TOKEN',
    assignees: ['alice', 'bob'], sourceProject: 'team/new', approvedLabelMap: {},
  })
  click('เพิ่มแหล่ง Issues')
  check('https://gitlab.dhas.com', 'GITLAB_DHAS_TOKEN', 'wasant_p')
})

test('editing a saved source preserves its custom values instead of applying creation defaults', async () => {
  const config = { id: uuid(1), provider: 'github', instanceUrl: 'https://github.com', sourceProject: 'team/saved', assignees: ['alice', 'bob'], tokenEnvVar: 'GITHUB_TEAM_TOKEN', enabled: true, approvedLabelMap: { defect: 'bug' }, firstSyncApproved: true }
  const { render, field, click } = await setup([config])
  click('แก้ไข config')
  assert.equal(field('source').props.value, config.sourceProject)
  assert.equal(field('token-env').props.value, config.tokenEnvVar)
  assert.equal(field('assignees').props.value, 'alice, bob')
  assert.equal(render().find((node) => node.props['aria-label'] === 'Source label 1').props.value, 'defect')
})
