import test from 'node:test'
import assert from 'node:assert/strict'

import { component as componentBuilder } from '@liquid-bricks/lib-component-builder'

import { domain, registerComponent, withGraphContext } from '../helpers.mjs'

test('handler allows data entries without fnc', async () => {
  await withGraphContext(async ({ diagnostics, dataMapper, g }) => {
    const component = componentBuilder('NoDataFncComponent')
      .data('dataNoFnc', { deps: () => { } })
      .toJSON()
    delete component.data[0].fnc

    await registerComponent({ diagnostics, dataMapper, g }, component)

    const [dataId] = await g
      .V()
      .has('label', domain.vertex.data.constants.LABEL)
      .has('name', 'dataNoFnc')
      .id()

    assert.ok(dataId, 'data vertex missing')
  })
})

function makeBaseComponent(overrides = {}) {
  return { ...componentBuilder('BuildDependencyListComponent').toJSON(), ...overrides }
}

const failureCases = [
  {
    title: 'task missing name',
    component: makeBaseComponent({
      hash: 'hash-task-missing-name',
      tasks: [{ fnc: 'fn', codeRef: { file: 't.js', line: 1, column: 1 }, deps: [] }],
    }),
  },
  {
    title: 'task missing fnc',
    component: makeBaseComponent({
      hash: 'hash-task-missing-fnc',
      tasks: [{ name: 'task', codeRef: { file: 't.js', line: 1, column: 1 }, deps: [] }],
    }),
  },
  {
    title: 'task missing codeRef',
    component: makeBaseComponent({
      hash: 'hash-task-missing-codeRef',
      tasks: [{ name: 'task', fnc: 'fn', codeRef: 'nope', deps: [] }],
    }),
  },
  {
    title: 'task deps not array',
    component: makeBaseComponent({
      hash: 'hash-task-deps-not-array',
      tasks: [{ name: 'task', fnc: 'fn', codeRef: { file: 't.js', line: 1, column: 1 }, deps: {} }],
    }),
  },
  {
    title: 'task inject not array',
    component: makeBaseComponent({
      hash: 'hash-task-inject-not-array',
      tasks: [{ name: 'task', fnc: 'fn', codeRef: { file: 't.js', line: 1, column: 1 }, deps: [], inject: {} }],
    }),
  },
  {
    title: 'data missing name',
    component: makeBaseComponent({
      hash: 'hash-data-missing-name',
      data: [{ codeRef: { file: 'd.js', line: 1, column: 1 }, deps: [] }],
    }),
  },
  {
    title: 'data deps not array',
    component: makeBaseComponent({
      hash: 'hash-data-deps-not-array',
      data: [{ name: 'data', codeRef: { file: 'd.js', line: 1, column: 1 }, deps: {} }],
    }),
  },
  {
    title: 'data missing codeRef',
    component: makeBaseComponent({
      hash: 'hash-data-missing-codeRef',
      data: [{ name: 'data', codeRef: 'nope', deps: [] }],
    }),
  },
  {
    title: 'data inject not array',
    component: makeBaseComponent({
      hash: 'hash-data-inject-not-array',
      data: [{ name: 'data', codeRef: { file: 'd.js', line: 1, column: 1 }, deps: [], inject: {} }],
    }),
  },
]

for (const { title, component } of failureCases) {
  test(`handler rejects when ${title}`, async () => {
    await withGraphContext(async ({ diagnostics, dataMapper, g }) => {
      await assert.rejects(
        registerComponent({ diagnostics, dataMapper, g }, component),
        diagnostics.DiagnosticError,
      )
    })
  })
}
