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

    const [taskAId] = await dataMapper.query.findTaskAId()
    const [taskBId] = await dataMapper.query.findTaskBId()
    const [dataOneId] = await dataMapper.query.findDataOneId()
    const [dataTwoId] = await dataMapper.query.findDataTwoId()

    assert.ok(taskAId, 'taskA vertex missing')
    assert.ok(taskBId, 'taskB vertex missing')
    assert.ok(dataOneId, 'dataOne vertex missing')
    assert.ok(dataTwoId, 'dataTwo vertex missing')

    const taskADataInjects = await dataMapper.query.readTaskADataInjects({ vertexId: taskAId })
    assert.deepEqual(taskADataInjects, [dataOneId])

    const taskATaskInjects = await dataMapper.query.readTaskATaskInjects({ vertexId: taskAId })
    assert.deepEqual(taskATaskInjects, [taskBId])

    const dataOneDataInjects = await dataMapper.query.readDataOneDataInjects({ vertexId: dataOneId })
    assert.deepEqual(dataOneDataInjects, [dataTwoId])

    const dataOneTaskInjects = await dataMapper.query.readDataOneTaskInjects({ vertexId: dataOneId })
    assert.deepEqual(dataOneTaskInjects, [taskBId])

    assert.deepEqual(await dataMapper.query.findInjectsIntoTaskData({ vertexId: taskBId }), [])
    assert.deepEqual(await dataMapper.query.findInjectsIntoDataTask({ vertexId: dataTwoId }), [])
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

    const taskTargets = await dataMapper.query.readTaskTargets({ vertexId: mainTaskId })
    assert.deepEqual(taskTargets.sort(), [wordsProcessId, firstInitId].sort())

    const dataTargets = await dataMapper.query.readDataTargets({ vertexId: mainTaskId })
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
