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

    const [providerComponentId] = await dataMapper.query.findProviderComponentId({ hash: providerComponent.hash })
    const [targetComponentId] = await dataMapper.query.findTargetComponentId({ hash: targetComponent.hash })
    const [rootComponentId] = await dataMapper.query.findComponentIdByHash({ hash: rootComponent.hash })

    const [providerTaskId] = await dataMapper.query.findProviderTaskId({ vertexId: providerComponentId })
    const [providerDataId] = await dataMapper.query.findProviderDataId({ vertexId: providerComponentId })
    const [targetTaskId] = await dataMapper.query.findTargetTaskId({ vertexId: targetComponentId })
    const [targetDataId] = await dataMapper.query.findTargetDataId({ vertexId: targetComponentId })
    const [rootDataId] = await dataMapper.query.findRootDataId({ vertexId: rootComponentId })

    assert.ok(providerTaskId, 'provider task missing')
    assert.ok(providerDataId, 'provider data missing')
    assert.ok(targetTaskId, 'target task missing')
    assert.ok(targetDataId, 'target data missing')
    assert.ok(rootDataId, 'root data missing')

    const targetTaskDataTargets = await dataMapper.query.readTargetTaskDataTargets({ vertexId: targetTaskId })
    assert.deepEqual(targetTaskDataTargets.sort(), [providerDataId, rootDataId].sort())

    const targetDataTaskTargets = await dataMapper.query.readTargetDataTaskTargets({ vertexId: targetDataId })
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
