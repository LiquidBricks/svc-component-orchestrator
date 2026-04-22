import test from 'node:test'
import assert from 'node:assert/strict'

import { component as componentBuilder } from '@liquid-bricks/lib-component-builder'

import { domain, registerHandlerComponent, withGraphContext } from '../helpers.mjs'

test('handler builds inject edges for data and tasks', async () => {
  await withGraphContext(async ({ diagnostics, dataMapper, g }) => {
    const component = componentBuilder('InjectComponent')
      .task('taskB', {})
      .data('dataTwo', { deps: () => { } })
      .data('dataOne', { deps: () => { }, inject: ({ data, task }) => { data.dataTwo; task.taskB } })
      .task('taskA', { inject: ({ data, task }) => { data.dataOne; task.taskB } })
      .toJSON()

    await registerHandlerComponent({ diagnostics, dataMapper, g }, component)

    const [taskAId] = await g.V().has('label', domain.vertex.task.constants.LABEL).has('name', 'taskA').id()
    const [taskBId] = await g.V().has('label', domain.vertex.task.constants.LABEL).has('name', 'taskB').id()
    const [dataOneId] = await g.V().has('label', domain.vertex.data.constants.LABEL).has('name', 'dataOne').id()
    const [dataTwoId] = await g.V().has('label', domain.vertex.data.constants.LABEL).has('name', 'dataTwo').id()

    assert.ok(taskAId, 'taskA vertex missing')
    assert.ok(taskBId, 'taskB vertex missing')
    assert.ok(dataOneId, 'dataOne vertex missing')
    assert.ok(dataTwoId, 'dataTwo vertex missing')

    const taskADataInjects = await g.V(taskAId).out(domain.edge.injects_into.task_data.constants.LABEL).id()
    assert.deepEqual(taskADataInjects, [dataOneId])

    const taskATaskInjects = await g.V(taskAId).out(domain.edge.injects_into.task_task.constants.LABEL).id()
    assert.deepEqual(taskATaskInjects, [taskBId])

    const dataOneDataInjects = await g.V(dataOneId).out(domain.edge.injects_into.data_data.constants.LABEL).id()
    assert.deepEqual(dataOneDataInjects, [dataTwoId])

    const dataOneTaskInjects = await g.V(dataOneId).out(domain.edge.injects_into.data_task.constants.LABEL).id()
    assert.deepEqual(dataOneTaskInjects, [taskBId])

    assert.deepEqual(await g.V(taskBId).out(domain.edge.injects_into.task_data.constants.LABEL).id(), [])
    assert.deepEqual(await g.V(dataTwoId).out(domain.edge.injects_into.data_task.constants.LABEL).id(), [])
  })
})

test('handler resolves namespaced inject paths through imports', async () => {
  await withGraphContext(async ({ diagnostics, dataMapper, g }) => {
    const componentFirst = componentBuilder('FirstComponent')
      .task('init', {})
      .toJSON()
    const componentEngine = componentBuilder('EngineComponent')
      .import('first', { hash: componentFirst.hash })
      .task('boot', {})
      .toJSON()
    const componentWords = componentBuilder('WordsComponent')
      .import('engine', { hash: componentEngine.hash })
      .task('process', {})
      .data('vocab', { deps: () => { } })
      .toJSON()
    const componentRoot = componentBuilder('RootComponent')
      .import('words', { hash: componentWords.hash })
      .task('main', { inject: ({ words }) => { words.task.process; words.engine.first.task.init; words.data.vocab } })
      .toJSON()

    await registerHandlerComponent({ diagnostics, dataMapper, g }, componentFirst)
    await registerHandlerComponent({ diagnostics, dataMapper, g }, componentEngine)
    await registerHandlerComponent({ diagnostics, dataMapper, g }, componentWords)
    await registerHandlerComponent({ diagnostics, dataMapper, g }, componentRoot)

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

    const taskTargets = await g.V(mainTaskId).out(domain.edge.injects_into.task_task.constants.LABEL).id()
    assert.deepEqual(taskTargets.sort(), [wordsProcessId, firstInitId].sort())

    const dataTargets = await g.V(mainTaskId).out(domain.edge.injects_into.task_data.constants.LABEL).id()
    assert.deepEqual(dataTargets, [wordsVocabId])
  })
})

test('handler rejects unsupported injection types', async () => {
  await withGraphContext(async ({ diagnostics, dataMapper, g }) => {
    const component = componentBuilder('InvalidInjectionComponent')
      .task('taskInvalidInject', { inject: ({ deferred }) => deferred.ready })
      .toJSON()

    await assert.rejects(
      registerHandlerComponent({ diagnostics, dataMapper, g }, component),
      diagnostics.DiagnosticError,
    )
  })
})
