import test from 'node:test'
import assert from 'node:assert/strict'

import { agentFn, component as componentBuilder } from '../../../../../../../../lib-component-builder/componentBuilder/index.js'

import { domain, registerHandlerComponent, withGraphContext } from '../helpers.mjs'

test('handler builds component graph and dependency edges', async () => {
  await withGraphContext(async ({ diagnostics, dataMapper, g }) => {
    const component = componentBuilder('TestComponent')
      .task('task2', {})
      .data('data1', { deps: ({ task }) => task.task2 })
      .task('task1', { deps: ({ data, deferred }) => { data.data1; deferred.deferred } })
      .toJSON()

    await registerHandlerComponent({ diagnostics, dataMapper, g }, component)

    const [componentId] = await dataMapper.query.findComponentIdByHash({ hash: component.hash })
    assert.ok(componentId, 'component vertex missing')

    const [task1Id] = await dataMapper.query.findTask1Id()
    const [task2Id] = await dataMapper.query.findTask2Id()
    const [data1Id] = await dataMapper.query.findData1Id()
    const [deferredId] = await dataMapper.query.findDeferredId()

    assert.ok(task1Id, 'task1 vertex missing')
    assert.ok(task2Id, 'task2 vertex missing')
    assert.ok(data1Id, 'data1 vertex missing')
    assert.ok(deferredId, 'deferred vertex missing')

    const componentTasks = await dataMapper.query.readComponentTasks({ vertexId: componentId })
    assert.deepEqual(componentTasks.sort(), [task1Id, task2Id].sort())

    const componentData = await dataMapper.query.readComponentData({ vertexId: componentId })
    assert.deepEqual(componentData, [data1Id])

    const componentDeferred = await dataMapper.query.readComponentDeferred({ vertexId: componentId })
    assert.deepEqual(componentDeferred, [deferredId])

    const task1DataDeps = await dataMapper.query.readTask1DataDeps({ vertexId: task1Id })
    assert.deepEqual(task1DataDeps, [data1Id])

    const task1DeferredDeps = await dataMapper.query.readTask1DeferredDeps({ vertexId: task1Id })
    assert.deepEqual(task1DeferredDeps, [deferredId])

    const dataTaskDeps = await dataMapper.query.readDataTaskDeps({ vertexId: data1Id })
    assert.deepEqual(dataTaskDeps, [task2Id])

    assert.deepEqual(await dataMapper.query.findHasDependencyTaskTask({ vertexId: task1Id }), [])
    assert.deepEqual(await dataMapper.query.findHasDependencyDataData({ vertexId: data1Id }), [])
    assert.deepEqual(await dataMapper.query.findHasDependencyDataDeferred({ vertexId: data1Id }), [])
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

    await registerHandlerComponent({ diagnostics, dataMapper, g }, componentFirst)
    await registerHandlerComponent({ diagnostics, dataMapper, g }, componentEngine)
    await registerHandlerComponent({ diagnostics, dataMapper, g }, componentWords)
    await registerHandlerComponent({ diagnostics, dataMapper, g }, componentRoot)

    const [rootComponentId] = await dataMapper.query.findComponentIdByHash({ hash: componentRoot.hash })
    const [mainTaskId] = await dataMapper.query.findMainTaskId({ vertexId: rootComponentId })

    const [wordsComponentId] = await dataMapper.query.findWordsComponentId({ hash: componentWords.hash })
    const [wordsProcessId] = await dataMapper.query.findWordsProcessId({ vertexId: wordsComponentId })
    const [wordsVocabId] = await dataMapper.query.findWordsVocabId({ vertexId: wordsComponentId })

    const [firstComponentId] = await dataMapper.query.findFirstComponentId({ hash: componentFirst.hash })
    const [firstInitId] = await dataMapper.query.findFirstInitId({ vertexId: firstComponentId })

    assert.ok(mainTaskId, 'main task missing')
    assert.ok(wordsProcessId, 'words process task missing')
    assert.ok(wordsVocabId, 'words vocab data missing')
    assert.ok(firstInitId, 'first init task missing')

    const taskDeps = await dataMapper.query.readTaskDeps({ vertexId: mainTaskId })
    assert.deepEqual(taskDeps.sort(), [wordsProcessId, firstInitId].sort())

    const dataDeps = await dataMapper.query.readDataDeps({ vertexId: mainTaskId })
    assert.deepEqual(dataDeps, [wordsVocabId])

    assert.deepEqual(await dataMapper.query.findHasDependencyTaskDeferred({ vertexId: mainTaskId }), [])
  })
})

test('handler accepts agentFn deps without creating graph dependency edges', async () => {
  await withGraphContext(async ({ diagnostics, dataMapper, g }) => {
    const runCommand = agentFn({ portAddr: 'cmd.run', fn: () => 'ok' })
    const component = componentBuilder('AgentFnDeps')
      .agentFn('runCommand', { portAddr: runCommand })
      .task('bootstrap', { deps: ({ agentFn }) => agentFn.runCommand })
      .toJSON()

    await registerHandlerComponent({ diagnostics, dataMapper, g }, component)

    const [componentId] = await dataMapper.query.findComponentIdByHash({ hash: component.hash })
    const [bootstrapTaskId] = await dataMapper.query.findBootstrapTaskId({ vertexId: componentId })

    assert.ok(bootstrapTaskId, 'bootstrap task missing')
    assert.deepEqual(await dataMapper.query.findHasDependencyTaskTask({ vertexId: bootstrapTaskId }), [])
    assert.deepEqual(await dataMapper.query.findHasDependencyTaskData({ vertexId: bootstrapTaskId }), [])
    assert.deepEqual(await dataMapper.query.findHasDependencyTaskDeferred({ vertexId: bootstrapTaskId }), [])
  })
})

test('handler rejects agentFn deps when the alias is not registered', async () => {
  await withGraphContext(async ({ diagnostics, dataMapper, g }) => {
    const component = componentBuilder('MissingAgentFnDep')
      .task('bootstrap', { deps: ({ agentFn }) => agentFn.runCommand })
      .toJSON()

    await assert.rejects(
      registerHandlerComponent({ diagnostics, dataMapper, g }, component),
      diagnostics.DiagnosticError,
    )
  })
})

test('handler rejects unknown dependency types', async () => {
  await withGraphContext(async ({ diagnostics, dataMapper, g }) => {
    const component = componentBuilder('InvalidComponent')
      .task('invalidTask', { deps: ({ unknown }) => unknown.dep })
      .toJSON()

    await assert.rejects(
      registerHandlerComponent({ diagnostics, dataMapper, g }, component),
      diagnostics.DiagnosticError,
    )
  })
})
