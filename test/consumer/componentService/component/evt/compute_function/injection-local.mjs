import test from 'node:test'
import assert from 'node:assert/strict'
import { component as componentBuilder } from '@liquid-bricks/lib-component-builder'

import {
  createBasicSubject,
  computeFunctionDataSubject,
  computeFunctionGateSubject,
  computeFunctionTaskSubject,
  assertDataStartDependantsPayload,
  withGraphContext,
  registerComponent,
  createInstance,
  loadImports,
  getComponentId,
  getStateMachineId,
  getStateEdgeId,
  pickFirst,
  runSpec,
  runInjectResultsCommands,
  injectResultsSubject,
  computeFunctionSpec,
  startDependantsSpec,
  STATE_EDGE_STATUS_BY_TYPE,
} from './helpers.mjs'

import { events as natsEvents } from '@liquid-bricks/lib-nats-subject/events/nats'


test('computeFunction publishes injected computeFunction events for injection targets', async () => {
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
    const componentId = await getComponentId({ g, dataMapper, diagnostics, componentHash: component.hash })
    const imports = await loadImports({ g, dataMapper, componentId })
    await createInstance({ diagnostics, dataMapper, g }, { componentHash: component.hash, componentId, instanceId, imports })

    const { stateMachineId } = await getStateMachineId({ g, dataMapper, instanceId })
    const sourceEdgeId = await getStateEdgeId({ g, dataMapper, stateMachineId, type: 'data', name: 'dataSource' })
    const dataTargetStateEdgeId = await getStateEdgeId({ g, dataMapper, stateMachineId, type: 'data', name: 'dataTarget' })
    const taskTargetStateEdgeId = await getStateEdgeId({ g, dataMapper, stateMachineId, type: 'task', name: 'taskB' })

    assert.ok(sourceEdgeId, 'source data state edge missing')
    assert.ok(dataTargetStateEdgeId, 'dataTarget state edge missing')
    assert.ok(taskTargetStateEdgeId, 'taskB state edge missing')

    const published = []
    let acked = false
    const resultPayload = { injected: true }
    const message = {
      subject: computeFunctionDataSubject,
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

    const finalScope = await runSpec({ spec: computeFunctionSpec, rootCtx, message })

    assert.equal(finalScope.stateEdgeId, sourceEdgeId)
    assert.equal(acked, true)

    const [updatedValues] = await dataMapper.query.readStateEdgeStatusAndResult({ edgeId: sourceEdgeId })
    assert.equal(pickFirst(updatedValues.status), STATE_EDGE_STATUS_BY_TYPE.data)
    assert.equal(pickFirst(updatedValues.result), JSON.stringify(resultPayload))

    const computeFunctionSubject = computeFunctionDataSubject
    const computeFunctionSubjects = new Set([computeFunctionSubject, computeFunctionTaskSubject])
    const startDependantsSubject = createBasicSubject(natsEvents['*'].component_service['*']['*'].cmd.componentInstance.start_dependants.v1['*']).forPublish()
      .env('prod')
      .build()

    const injectResultsCommands = published.filter(p => p.subject === injectResultsSubject)
    const startDependantsEvents = published.filter(p => p.subject === startDependantsSubject)

    assert.equal(injectResultsCommands.length, 1)
    assert.deepEqual(injectResultsCommands[0].payload.data, {
      instanceId,
      instanceVertexId: finalScope.instanceVertexId,
      stateMachineId,
      stateEdgeId: sourceEdgeId,
      type: 'data',
      result: resultPayload,
    })

    const injectedPublishes = await runInjectResultsCommands({ rootCtx, events: published })
    const injectedEvents = injectedPublishes.filter(p => computeFunctionSubjects.has(p.subject))

    assert.equal(startDependantsEvents.length, 1)
    assertDataStartDependantsPayload(startDependantsEvents[0].payload.data, {
      instanceId,
      stateEdgeId: sourceEdgeId,
      result: resultPayload,
    })

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
    const componentId = await getComponentId({ g, dataMapper, diagnostics, componentHash: component.hash })
    const imports = await loadImports({ g, dataMapper, componentId })
    await createInstance({ diagnostics, dataMapper, g }, { componentHash: component.hash, componentId, instanceId, imports })

    const { stateMachineId } = await getStateMachineId({ g, dataMapper, instanceId })
    const dataTargetStateEdgeId = await getStateEdgeId({ g, dataMapper, stateMachineId, type: 'data', name: 'dataTarget' })
    const dependantDataStateEdgeId = await getStateEdgeId({ g, dataMapper, stateMachineId, type: 'data', name: 'dataDependent' })
    const dependantTaskStateEdgeId = await getStateEdgeId({ g, dataMapper, stateMachineId, type: 'task', name: 'taskDependent' })

    assert.ok(dataTargetStateEdgeId, 'dataTarget state edge missing')
    assert.ok(dependantDataStateEdgeId, 'dataDependent state edge missing')
    assert.ok(dependantTaskStateEdgeId, 'taskDependent state edge missing')

    const computeFunctionSubject = computeFunctionDataSubject
    const startDependantsSubject = createBasicSubject(natsEvents['*'].component_service['*']['*'].cmd.componentInstance.start_dependants.v1['*']).forPublish()
      .env('prod')
      .build()
    const startDataSubject = createBasicSubject(natsEvents['*'].component_service['*']['*'].cmd.data.start.v1['*']).forPublish()
      .env('prod')
      .build()
    const startTaskSubject = createBasicSubject(natsEvents['*'].component_service['*']['*'].cmd.task.start.v1['*']).forPublish()
      .env('prod')
      .build()

    const initialPublishes = []
    const initialMessage = {
      subject: computeFunctionSubject,
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
    const initialRootCtx = {
      diagnostics,
      g,
      dataMapper,
      natsContext: { publish: async (subject, payload) => initialPublishes.push({ subject, payload: JSON.parse(payload) }) },
    }
    await runSpec({
      spec: computeFunctionSpec,
      rootCtx: initialRootCtx,
      message: initialMessage,
    })

    const initialInjectedPublishes = await runInjectResultsCommands({
      rootCtx: initialRootCtx,
      events: initialPublishes,
    })
    const injectedEvent = initialInjectedPublishes.find(p => p.subject === computeFunctionSubject && p.payload?.data?.name === 'dataTarget')
    assert.ok(injectedEvent, 'injected result for dataTarget not published')

    const injectedPublishes = []
    let injectedAcked = false
    const injectedMessage = {
      subject: computeFunctionSubject,
      ack: () => { injectedAcked = true },
      json: () => injectedEvent.payload,
    }
    await runSpec({
      spec: computeFunctionSpec,
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
    assertDataStartDependantsPayload(targetStartDependants[0].payload.data, {
      instanceId,
      stateEdgeId: dataTargetStateEdgeId,
      result: injectedEvent.payload.data.result,
    })

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
        g, dataMapper,
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
