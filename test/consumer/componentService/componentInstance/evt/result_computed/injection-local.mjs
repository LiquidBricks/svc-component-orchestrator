import test from 'node:test'
import assert from 'node:assert/strict'

import { component as componentBuilder } from '@liquid-bricks/lib-component-builder'

import {
  createBasicSubject,
  withGraphContext,
  registerComponent,
  createInstance,
  loadImports,
  getComponentId,
  getStateMachineId,
  getStateEdgeId,
  pickFirst,
  runSpec,
  resultComputedSpec,
  startDependantsSpec,
  STATE_EDGE_STATUS_BY_TYPE,
} from './helpers.mjs'

test('result_computed publishes injected result_computed events for injection targets', async () => {
  await withGraphContext(async ({ diagnostics, dataMapper, g }) => {
    const component = componentBuilder('ResultInjectionComponent')
      .task('taskB', {})
      .data('dataTarget', { deps: () => { } })
      .data('dataSource', {
        deps: () => { },
        inject: ({ data, task }) => { data.dataTarget; task.taskB },
      })
      .toJSON()

    await registerComponent(component, { diagnostics, dataMapper, g })

    const instanceId = 'instance-result-injection'
    const componentId = await getComponentId({ g, diagnostics, componentHash: component.hash })
    const imports = await loadImports({ g, componentId })
    await createInstance({ diagnostics, dataMapper, g }, { componentHash: component.hash, componentId, instanceId, imports })

    const { stateMachineId } = await getStateMachineId({ g, instanceId })
    const sourceEdgeId = await getStateEdgeId({ g, stateMachineId, type: 'data', name: 'dataSource' })
    const dataTargetStateEdgeId = await getStateEdgeId({ g, stateMachineId, type: 'data', name: 'dataTarget' })
    const taskTargetStateEdgeId = await getStateEdgeId({ g, stateMachineId, type: 'task', name: 'taskB' })

    assert.ok(sourceEdgeId, 'source data state edge missing')
    assert.ok(dataTargetStateEdgeId, 'dataTarget state edge missing')
    assert.ok(taskTargetStateEdgeId, 'taskB state edge missing')

    const published = []
    let acked = false
    const resultPayload = { injected: true }
    const message = {
      subject: createBasicSubject()
        .env('prod')
        .ns('component-service')
        .entity('componentInstance')
        .channel('evt')
        .action('result_computed')
        .version('v1')
        .build(),
      ack: () => { acked = true },
      json: () => ({
        data: {
          instanceId,
          type: 'data',
          name: 'dataSource',
          result: resultPayload,
        }
      }),
    }
    const rootCtx = {
      diagnostics,
      g,
      dataMapper,
      natsContext: { publish: async (subject, payload) => published.push({ subject, payload: JSON.parse(payload) }) },
    }

    const finalScope = await runSpec({ spec: resultComputedSpec, rootCtx, message })

    assert.equal(finalScope.stateEdgeId, sourceEdgeId)
    assert.equal(acked, true)

    const [updatedValues] = await g.E(sourceEdgeId).valueMap('status', 'result')
    assert.equal(pickFirst(updatedValues.status), STATE_EDGE_STATUS_BY_TYPE.data)
    assert.equal(pickFirst(updatedValues.result), JSON.stringify(resultPayload))

    const resultComputedSubject = createBasicSubject()
      .env('prod')
      .ns('component-service')
      .entity('componentInstance')
      .channel('evt')
      .action('result_computed')
      .version('v1')
      .build()
    const startDependantsSubject = createBasicSubject()
      .env('prod')
      .ns('component-service')
      .entity('componentInstance')
      .channel('cmd')
      .action('start_dependants')
      .version('v1')
      .build()

    const injectedEvents = published.filter(p => p.subject === resultComputedSubject)
    const startDependantsEvents = published.filter(p => p.subject === startDependantsSubject)

    assert.equal(startDependantsEvents.length, 1)
    assert.deepEqual(startDependantsEvents[0].payload.data, { instanceId, stateEdgeId: sourceEdgeId, type: 'data' })

    const injectedPayloads = injectedEvents
      .map(evt => evt.payload.data)
      .sort((a, b) => a.name.localeCompare(b.name))

    assert.equal(injectedPayloads.length, 2)
    assert.deepEqual(injectedPayloads, [
      { instanceId, stateId: dataTargetStateEdgeId, name: 'dataTarget', type: 'data', result: resultPayload },
      { instanceId, stateId: taskTargetStateEdgeId, name: 'taskB', type: 'task', result: resultPayload },
    ])
  })
})

test('injected result triggers dependant data and task start commands', async () => {
  await withGraphContext(async ({ diagnostics, dataMapper, g }) => {
    const component = componentBuilder('InjectedDependants')
      .data('dataTarget', { deps: () => { } })
      .data('dataSource', { deps: () => { }, inject: ({ data }) => data.dataTarget })
      .data('dataDependent', { deps: ({ data }) => data.dataTarget })
      .task('taskDependent', { deps: ({ data }) => data.dataTarget })
      .toJSON()

    await registerComponent(component, { diagnostics, dataMapper, g })

    const instanceId = 'instance-injected-dependants'
    const componentId = await getComponentId({ g, diagnostics, componentHash: component.hash })
    const imports = await loadImports({ g, componentId })
    await createInstance({ diagnostics, dataMapper, g }, { componentHash: component.hash, componentId, instanceId, imports })

    const { stateMachineId } = await getStateMachineId({ g, instanceId })
    const dataTargetStateEdgeId = await getStateEdgeId({ g, stateMachineId, type: 'data', name: 'dataTarget' })
    const dependantDataStateEdgeId = await getStateEdgeId({ g, stateMachineId, type: 'data', name: 'dataDependent' })
    const dependantTaskStateEdgeId = await getStateEdgeId({ g, stateMachineId, type: 'task', name: 'taskDependent' })

    assert.ok(dataTargetStateEdgeId, 'dataTarget state edge missing')
    assert.ok(dependantDataStateEdgeId, 'dataDependent state edge missing')
    assert.ok(dependantTaskStateEdgeId, 'taskDependent state edge missing')

    const resultComputedSubject = createBasicSubject()
      .env('prod')
      .ns('component-service')
      .entity('componentInstance')
      .channel('evt')
      .action('result_computed')
      .version('v1')
      .build()
    const startDependantsSubject = createBasicSubject()
      .env('prod')
      .ns('component-service')
      .entity('componentInstance')
      .channel('cmd')
      .action('start_dependants')
      .version('v1')
      .build()
    const startDataSubject = createBasicSubject()
      .env('prod')
      .ns('component-service')
      .entity('data')
      .channel('cmd')
      .action('start')
      .version('v1')
      .build()
    const startTaskSubject = createBasicSubject()
      .env('prod')
      .ns('component-service')
      .entity('task')
      .channel('cmd')
      .action('start')
      .version('v1')
      .build()

    const initialPublishes = []
    const initialMessage = {
      subject: resultComputedSubject,
      ack: () => { },
      json: () => ({
        data: {
          instanceId,
          type: 'data',
          name: 'dataSource',
          result: { injected: true },
        }
      }),
    }
    await runSpec({
      spec: resultComputedSpec,
      rootCtx: {
        diagnostics,
        g,
        dataMapper,
        natsContext: { publish: async (subject, payload) => initialPublishes.push({ subject, payload: JSON.parse(payload) }) },
      },
      message: initialMessage,
    })

    const injectedEvent = initialPublishes.find(p => p.subject === resultComputedSubject && p.payload?.data?.name === 'dataTarget')
    assert.ok(injectedEvent, 'injected result for dataTarget not published')

    const injectedPublishes = []
    let injectedAcked = false
    const injectedMessage = {
      subject: resultComputedSubject,
      ack: () => { injectedAcked = true },
      json: () => injectedEvent.payload,
    }
    await runSpec({
      spec: resultComputedSpec,
      rootCtx: {
        diagnostics,
        g,
        dataMapper,
        natsContext: { publish: async (subject, payload) => injectedPublishes.push({ subject, payload: JSON.parse(payload) }) },
      },
      message: injectedMessage,
    })
    assert.equal(injectedAcked, true)

    const targetStartDependants = injectedPublishes.filter(p => p.subject === startDependantsSubject)
    assert.equal(targetStartDependants.length, 1)
    assert.deepEqual(targetStartDependants[0].payload.data, { instanceId, stateEdgeId: dataTargetStateEdgeId, type: 'data' })

    const dependantPublishes = []
    let startAcked = false
    const startDependantsMessage = {
      subject: startDependantsSubject,
      ack: () => { startAcked = true },
      json: () => targetStartDependants[0].payload,
    }
    await runSpec({
      spec: startDependantsSpec,
      rootCtx: {
        diagnostics,
        g,
        natsContext: { publish: async (subject, payload) => dependantPublishes.push({ subject, payload: JSON.parse(payload) }) },
      },
      message: startDependantsMessage,
    })
    assert.equal(startAcked, true)

    const startDataEvents = dependantPublishes.filter(p => p.subject === startDataSubject)
    const startTaskEvents = dependantPublishes.filter(p => p.subject === startTaskSubject)

    assert.equal(startDataEvents.length, 1)
    assert.equal(startTaskEvents.length, 1)
    assert.deepEqual(startDataEvents[0].payload.data, { instanceId, stateId: dependantDataStateEdgeId })
    assert.deepEqual(startTaskEvents[0].payload.data, { instanceId, stateId: dependantTaskStateEdgeId })
  })
})
