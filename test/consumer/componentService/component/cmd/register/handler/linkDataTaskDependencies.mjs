import test from 'node:test'
import assert from 'node:assert/strict'

import { component as componentBuilder } from '@liquid-bricks/lib-component-builder'

import { domain, registerComponent, withGraphContext } from '../helpers.mjs'

test('handler builds component graph and dependency edges', async () => {
  await withGraphContext(async ({ diagnostics, dataMapper, g }) => {
    const component = componentBuilder('TestComponent')
      .task('task2', {})
      .data('data1', { deps: ({ task }) => task.task2 })
      .task('task1', { deps: ({ data, deferred }) => { data.data1; deferred.deferred } })
      .toJSON()

    await registerComponent({ diagnostics, dataMapper, g }, component)

    const [componentId] = await g
      .V()
      .has('label', domain.vertex.component.constants.LABEL)
      .has('hash', component.hash)
      .id()
    assert.ok(componentId, 'component vertex missing')

    const [task1Id] = await g.V().has('label', domain.vertex.task.constants.LABEL).has('name', 'task1').id()
    const [task2Id] = await g.V().has('label', domain.vertex.task.constants.LABEL).has('name', 'task2').id()
    const [data1Id] = await g.V().has('label', domain.vertex.data.constants.LABEL).has('name', 'data1').id()
    const [deferredId] = await g.V().has('label', domain.vertex.deferred.constants.LABEL).has('name', 'deferred').id()

    assert.ok(task1Id, 'task1 vertex missing')
    assert.ok(task2Id, 'task2 vertex missing')
    assert.ok(data1Id, 'data1 vertex missing')
    assert.ok(deferredId, 'deferred vertex missing')

    const componentTasks = await g.V(componentId).out(domain.edge.has_task.component_task.constants.LABEL).id()
    assert.deepEqual(componentTasks.sort(), [task1Id, task2Id].sort())

    const componentData = await g.V(componentId).out(domain.edge.has_data.component_data.constants.LABEL).id()
    assert.deepEqual(componentData, [data1Id])

    const componentDeferred = await g.V(componentId).out(domain.edge.has_deferred.component_deferred.constants.LABEL).id()
    assert.deepEqual(componentDeferred, [deferredId])

    const task1DataDeps = await g.V(task1Id).out(domain.edge.has_dependency.task_data.constants.LABEL).id()
    assert.deepEqual(task1DataDeps, [data1Id])

    const task1DeferredDeps = await g.V(task1Id).out(domain.edge.has_dependency.task_deferred.constants.LABEL).id()
    assert.deepEqual(task1DeferredDeps, [deferredId])

    const dataTaskDeps = await g.V(data1Id).out(domain.edge.has_dependency.data_task.constants.LABEL).id()
    assert.deepEqual(dataTaskDeps, [task2Id])

    assert.deepEqual(await g.V(task1Id).out(domain.edge.has_dependency.task_task.constants.LABEL).id(), [])
    assert.deepEqual(await g.V(data1Id).out(domain.edge.has_dependency.data_data.constants.LABEL).id(), [])
    assert.deepEqual(await g.V(data1Id).out(domain.edge.has_dependency.data_deferred.constants.LABEL).id(), [])
  })
})

test('handler resolves namespaced dependency paths through imports', async () => {
  await withGraphContext(async ({ diagnostics, dataMapper, g }) => {
    const componentFirst = componentBuilder('DepFirst')
      .task('init', {})
      .toJSON()
    const componentEngine = componentBuilder('DepEngine')
      .import('first', { hash: componentFirst.hash })
      .task('boot', {})
      .toJSON()
    const componentWords = componentBuilder('DepWords')
      .import('engine', { hash: componentEngine.hash })
      .task('process', {})
      .data('vocab', { deps: () => { } })
      .toJSON()
    const componentRoot = componentBuilder('DepRoot')
      .import('words', { hash: componentWords.hash })
      .task('main', { deps: ({ words }) => { words.task.process; words.engine.first.task.init; words.data.vocab } })
      .toJSON()

    await registerComponent({ diagnostics, dataMapper, g }, componentFirst)
    await registerComponent({ diagnostics, dataMapper, g }, componentEngine)
    await registerComponent({ diagnostics, dataMapper, g }, componentWords)
    await registerComponent({ diagnostics, dataMapper, g }, componentRoot)

    const [rootComponentId] = await g.V().has('label', domain.vertex.component.constants.LABEL).has('hash', componentRoot.hash).id()
    const [mainTaskId] = await g.V(rootComponentId).out(domain.edge.has_task.component_task.constants.LABEL).has('name', 'main').id()

    const [wordsComponentId] = await g.V().has('label', domain.vertex.component.constants.LABEL).has('hash', componentWords.hash).id()
    const [wordsProcessId] = await g.V(wordsComponentId).out(domain.edge.has_task.component_task.constants.LABEL).has('name', 'process').id()
    const [wordsVocabId] = await g.V(wordsComponentId).out(domain.edge.has_data.component_data.constants.LABEL).has('name', 'vocab').id()

    const [firstComponentId] = await g.V().has('label', domain.vertex.component.constants.LABEL).has('hash', componentFirst.hash).id()
    const [firstInitId] = await g.V(firstComponentId).out(domain.edge.has_task.component_task.constants.LABEL).has('name', 'init').id()

    assert.ok(mainTaskId, 'main task missing')
    assert.ok(wordsProcessId, 'words process task missing')
    assert.ok(wordsVocabId, 'words vocab data missing')
    assert.ok(firstInitId, 'first init task missing')

    const taskDeps = await g.V(mainTaskId).out(domain.edge.has_dependency.task_task.constants.LABEL).id()
    assert.deepEqual(taskDeps.sort(), [wordsProcessId, firstInitId].sort())

    const dataDeps = await g.V(mainTaskId).out(domain.edge.has_dependency.task_data.constants.LABEL).id()
    assert.deepEqual(dataDeps, [wordsVocabId])

    assert.deepEqual(await g.V(mainTaskId).out(domain.edge.has_dependency.task_deferred.constants.LABEL).id(), [])
  })
})

test('handler rejects unknown dependency types', async () => {
  await withGraphContext(async ({ diagnostics, dataMapper, g }) => {
    const component = componentBuilder('InvalidComponent')
      .task('invalidTask', { deps: ({ unknown }) => unknown.dep })
      .toJSON()

    await assert.rejects(
      registerComponent({ diagnostics, dataMapper, g }, component),
      diagnostics.DiagnosticError,
    )
  })
})
