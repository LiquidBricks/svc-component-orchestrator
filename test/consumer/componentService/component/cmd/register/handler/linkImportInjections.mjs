import test from 'node:test'
import assert from 'node:assert/strict'

import { component as componentBuilder } from '@liquid-bricks/lib-component-builder'

import { domain, registerHandlerComponent, withGraphContext } from '../helpers.mjs'

test('handler builds inject edges from import inject mappings', async () => {
  await withGraphContext(async ({ diagnostics, dataMapper, g }) => {
    const providerComponent = componentBuilder('ImportInjectProvider')
      .task('providerTask', {})
      .data('providerData', { deps: () => { } })
      .toJSON()
    const targetComponent = componentBuilder('ImportInjectTarget')
      .task('targetTask', {})
      .data('targetData', { deps: () => { } })
      .toJSON()
    const rootComponent = componentBuilder('ImportInjectRoot')
      .import('target', {
        hash: targetComponent.hash,
        inject: _ => [
          _.provider.data.providerData(_.target.task.targetTask),
          _.data.rootData(_.target.task.targetTask),
          _.provider.task.providerTask(_.target.data.targetData),
        ],
      })
      .import('provider', { hash: providerComponent.hash })
      .data('rootData', { deps: () => { } })
      .toJSON()

    await registerHandlerComponent({ diagnostics, dataMapper, g }, providerComponent)
    await registerHandlerComponent({ diagnostics, dataMapper, g }, targetComponent)
    await registerHandlerComponent({ diagnostics, dataMapper, g }, rootComponent)

    const [providerComponentId] = await g.V()
      .has('label', domain.vertex.component.constants.LABEL)
      .has('hash', providerComponent.hash).id()
    const [targetComponentId] = await g.V()
      .has('label', domain.vertex.component.constants.LABEL)
      .has('hash', targetComponent.hash).id()
    const [rootComponentId] = await g.V()
      .has('label', domain.vertex.component.constants.LABEL)
      .has('hash', rootComponent.hash).id()

    const [providerTaskId] = await g.V(providerComponentId)
      .out(domain.edge.has_task.component_task.constants.LABEL)
      .has('name', 'providerTask').id()
    const [providerDataId] = await g.V(providerComponentId)
      .out(domain.edge.has_data.component_data.constants.LABEL)
      .has('name', 'providerData').id()
    const [targetTaskId] = await g.V(targetComponentId)
      .out(domain.edge.has_task.component_task.constants.LABEL)
      .has('name', 'targetTask').id()
    const [targetDataId] = await g.V(targetComponentId)
      .out(domain.edge.has_data.component_data.constants.LABEL)
      .has('name', 'targetData').id()
    const [rootDataId] = await g.V(rootComponentId)
      .out(domain.edge.has_data.component_data.constants.LABEL)
      .has('name', 'rootData').id()

    assert.ok(providerTaskId, 'provider task missing')
    assert.ok(providerDataId, 'provider data missing')
    assert.ok(targetTaskId, 'target task missing')
    assert.ok(targetDataId, 'target data missing')
    assert.ok(rootDataId, 'root data missing')

    const targetTaskDataTargets = await g.V(targetTaskId)
      .out(domain.edge.injects_into.task_data.constants.LABEL).id()
    assert.deepEqual(targetTaskDataTargets.sort(), [providerDataId, rootDataId].sort())

    const targetDataTaskTargets = await g.V(targetDataId)
      .out(domain.edge.injects_into.data_task.constants.LABEL).id()
    assert.deepEqual(targetDataTaskTargets, [providerTaskId])
  })
})

test('handler rejects import inject when not an object', async () => {
  await withGraphContext(async ({ diagnostics, dataMapper, g }) => {
    const importedComponent = componentBuilder('ImportedComponent').toJSON()
    const rootComponent = componentBuilder('InvalidImportInjectRoot')
      .import('imported', { hash: importedComponent.hash })
      .toJSON()
    rootComponent.imports[0].inject = []

    await registerHandlerComponent({ diagnostics, dataMapper, g }, importedComponent)

    await assert.rejects(
      registerHandlerComponent({ diagnostics, dataMapper, g }, rootComponent),
      diagnostics.DiagnosticError,
    )
  })
})

test('handler rejects import inject targets when not an array', async () => {
  await withGraphContext(async ({ diagnostics, dataMapper, g }) => {
    const importedComponent = componentBuilder('ImportedComponentTwo').toJSON()
    const rootComponent = componentBuilder('InvalidImportInjectTargetsRoot')
      .import('imported', { hash: importedComponent.hash })
      .toJSON()
    rootComponent.imports[0].inject = {
      'imported.task.taskA': 'not-an-array',
    }

    await registerHandlerComponent({ diagnostics, dataMapper, g }, importedComponent)

    await assert.rejects(
      registerHandlerComponent({ diagnostics, dataMapper, g }, rootComponent),
      diagnostics.DiagnosticError,
    )
  })
})
