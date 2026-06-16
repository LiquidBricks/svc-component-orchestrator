import test from 'node:test'
import assert from 'node:assert/strict'
import { component } from '@liquid-bricks/lib-component-builder'

import {
  createBasicSubject,
  withGraphContext,
  registerComponent,
  createInstance,
  loadImports,
  getComponentId,
  getStateMachineId,
  getStateEdgeId,
  getImportedInstance,
  pickFirst,
  runSpec,
  runProcessInjectedComputeResultDoneEvents,
  computeResultDoneSpec,
  startDependantsSpec,
  domain,
} from './helpers.mjs'

import { events as natsEvents } from '@liquid-bricks/lib-nats-subject/events/nats'


test('imported injection triggers dependant starts inside imported component', async () => {
  await withGraphContext(async ({ diagnostics, dataMapper, g }) => {
    const childComponent = component('ImportedDependantsChild')
      .data('childTarget', { deps: () => { }, fnc: function fnChildTarget() { } })
      .data('childDataDep', { deps: ({ data }) => data.childTarget, fnc: function fnChildDep() { } })
      .task('childTaskDep', { deps: ({ data }) => data.childTarget, fnc: function fnChildTask() { } })

    const rootComponent = component('ImportedDependantsRoot')
      .import('child', { hash: childComponent })
      .data('rootData', { deps: () => { }, inject: ({ child }) => child.data.childTarget, fnc: function fnRoot() { } })

    const childContract = childComponent.toJSON()
    const rootContract = rootComponent.toJSON()

    await registerComponent(childContract, { diagnostics, dataMapper, g })
    await registerComponent(rootContract, { diagnostics, dataMapper, g })

    const rootInstanceId = 'instance-imported-dependants-root'
    const rootComponentId = await getComponentId({ g, diagnostics, componentHash: rootContract.hash })
    const imports = await loadImports({ g, rootComponentId })
    await createInstance({ diagnostics, dataMapper, g }, { componentHash: rootContract.hash, componentId: rootComponentId, instanceId: rootInstanceId, imports })

    const { instanceVertexId: rootInstanceVertexId, stateMachineId: rootStateMachineId } = await getStateMachineId({ g, instanceId: rootInstanceId })
    const rootDataStateEdgeId = await getStateEdgeId({ g, stateMachineId: rootStateMachineId, type: 'data', name: 'rootData' })

    const childInstanceVertexId = await getImportedInstance({ g, rootInstanceVertexId, aliasPath: ['child'] })
    assert.ok(childInstanceVertexId, 'child instance missing')
    const [childInstanceIdValues] = await g.V(childInstanceVertexId).valueMap('instanceId')
    const childInstanceId = pickFirst(childInstanceIdValues?.instanceId ?? childInstanceIdValues)
    const [childStateMachineId] = await g.V(childInstanceVertexId).out(domain.edge.has_stateMachine.componentInstance_stateMachine.constants.LABEL).id()

    const childTargetStateEdgeId = await getStateEdgeId({ g, stateMachineId: childStateMachineId, type: 'data', name: 'childTarget' })
    const childDepDataStateEdgeId = await getStateEdgeId({ g, stateMachineId: childStateMachineId, type: 'data', name: 'childDataDep' })
    const childDepTaskStateEdgeId = await getStateEdgeId({ g, stateMachineId: childStateMachineId, type: 'task', name: 'childTaskDep' })

    assert.ok(rootDataStateEdgeId, 'root data state edge missing')
    assert.ok(childTargetStateEdgeId, 'child target state edge missing')
    assert.ok(childDepDataStateEdgeId, 'child data dependant state edge missing')
    assert.ok(childDepTaskStateEdgeId, 'child task dependant state edge missing')

    const computeResultDoneSubject = createBasicSubject(natsEvents['*'].component_service['*']['*'].evt.componentInstance.computeResultDone.v1['*']).forPublish()
      .env('prod')
      .build()
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
    const initialRootCtx = {
      diagnostics,
      g,
      dataMapper,
      natsContext: { publish: async (subject, payload) => initialPublishes.push({ subject, payload: JSON.parse(payload) }) },
    }
    await runSpec({
      spec: computeResultDoneSpec,
      rootCtx: initialRootCtx,
      message: {
        subject: computeResultDoneSubject,
        ack: () => { },
        json: () => ({
          data: {
            instanceId: rootInstanceId,
            type: 'data',
            name: 'rootData',
            result: { injected: 'child' },
          }
        }),
      },
    })

    const initialInjectedPublishes = await runProcessInjectedComputeResultDoneEvents({
      rootCtx: initialRootCtx,
      events: initialPublishes,
    })
    const injectedEvent = initialInjectedPublishes.find(p =>
      p.subject === computeResultDoneSubject
      && p.payload?.data?.instanceId === childInstanceId
      && p.payload?.data?.name === 'childTarget'
    )
    assert.ok(injectedEvent, 'injected result for childTarget not published')

    const injectedPublishes = []
    await runSpec({
      spec: computeResultDoneSpec,
      rootCtx: {
        diagnostics,
        g,
        dataMapper,
        natsContext: { publish: async (subject, payload) => injectedPublishes.push({ subject, payload: JSON.parse(payload) }) },
      },
      message: {
        subject: computeResultDoneSubject,
        ack: () => { },
        json: () => injectedEvent.payload,
      },
    })

    const childStartDependants = injectedPublishes.filter(p => p.subject === startDependantsSubject)
    assert.equal(childStartDependants.length, 1)
    assert.deepEqual(childStartDependants[0].payload.data, { instanceId: childInstanceId, stateEdgeId: childTargetStateEdgeId, type: 'data' })

    const dependantPublishes = []
    await runSpec({
      spec: startDependantsSpec,
      rootCtx: {
        diagnostics,
        g,
        natsContext: { publish: async (subject, payload) => dependantPublishes.push({ subject, payload: JSON.parse(payload) }) },
      },
      message: {
        subject: startDependantsSubject,
        ack: () => { },
        json: () => childStartDependants[0].payload,
      },
    })

    const startDataEvents = dependantPublishes.filter(p => p.subject === startDataSubject)
    const startTaskEvents = dependantPublishes.filter(p => p.subject === startTaskSubject)
    assert.equal(startDataEvents.length, 1)
    assert.equal(startTaskEvents.length, 1)
    assert.deepEqual(startDataEvents[0].payload.data, { instanceId: childInstanceId, stateId: childDepDataStateEdgeId })
    assert.deepEqual(startTaskEvents[0].payload.data, { instanceId: childInstanceId, stateId: childDepTaskStateEdgeId })
  })
})

test('computeResultDone triggers parent dependant starts across imports', async () => {
  await withGraphContext(async ({ diagnostics, dataMapper, g }) => {
    const childComponent = component('ParentDependantsChild')
      .data('childTarget', { deps: () => { }, fnc: function fnChildTarget() { } })

    const parentComponent = component('ParentDependantsRoot')
      .import('child', { hash: childComponent })
      .task('parentTask', { deps: ({ child }) => child.data.childTarget, fnc: function fnParentTask() { } })
      .data('parentData', { deps: ({ child }) => child.data.childTarget, fnc: function fnParentData() { } })

    const childContract = childComponent.toJSON()
    const parentContract = parentComponent.toJSON()

    await registerComponent(childContract, { diagnostics, dataMapper, g })
    await registerComponent(parentContract, { diagnostics, dataMapper, g })

    const parentInstanceId = 'instance-parent-dependants'
    const parentComponentId = await getComponentId({ g, diagnostics, componentHash: parentContract.hash })
    const imports = await loadImports({ g, parentComponentId })
    await createInstance({ diagnostics, dataMapper, g }, { componentHash: parentContract.hash, componentId: parentComponentId, instanceId: parentInstanceId, imports })

    const { stateMachineId: parentStateMachineId, instanceVertexId: parentInstanceVertexId } = await getStateMachineId({ g, instanceId: parentInstanceId })
    const parentDataStateEdgeId = await getStateEdgeId({ g, stateMachineId: parentStateMachineId, type: 'data', name: 'parentData' })
    const parentTaskStateEdgeId = await getStateEdgeId({ g, stateMachineId: parentStateMachineId, type: 'task', name: 'parentTask' })

    const childInstanceVertexId = await getImportedInstance({ g, rootInstanceVertexId: parentInstanceVertexId, aliasPath: ['child'] })
    assert.ok(childInstanceVertexId, 'child instance missing')
    const [childInstanceIdValues] = await g.V(childInstanceVertexId).valueMap('instanceId')
    const childInstanceId = pickFirst(childInstanceIdValues?.instanceId ?? childInstanceIdValues)

    const published = []
    let resultAcked = false
    const computeResultDoneSubject = createBasicSubject(natsEvents['*'].component_service['*']['*'].evt.componentInstance.computeResultDone.v1['*']).forPublish()
      .env('prod')
      .build()

    await runSpec({
      spec: computeResultDoneSpec,
      rootCtx: {
        diagnostics,
        g,
        dataMapper,
        natsContext: { publish: async (subject, payload) => published.push({ subject, payload: JSON.parse(payload) }) },
      },
      message: {
        subject: computeResultDoneSubject,
        ack: () => { resultAcked = true },
        json: () => ({
          data: {
            instanceId: childInstanceId,
            type: 'data',
            name: 'childTarget',
            result: { triggered: 'parent' },
          }
        }),
      },
    })
    assert.equal(resultAcked, true)

    const startDependantsSubject = createBasicSubject(natsEvents['*'].component_service['*']['*'].cmd.componentInstance.start_dependants.v1['*']).forPublish()
      .env('prod')
      .build()

    const startDependantsEvents = published.filter(p => p.subject === startDependantsSubject)
    assert.equal(startDependantsEvents.length, 1)

    const dependantPublishes = []
    let startAcked = false
    const startDependantsMessage = {
      subject: startDependantsSubject,
      ack: () => { startAcked = true },
      json: () => startDependantsEvents[0].payload,
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

    const startDataSubject = createBasicSubject(natsEvents['*'].component_service['*']['*'].cmd.data.start.v1['*']).forPublish()
      .env('prod')
      .build()
    const startTaskSubject = createBasicSubject(natsEvents['*'].component_service['*']['*'].cmd.task.start.v1['*']).forPublish()
      .env('prod')
      .build()

    const startDataEvents = dependantPublishes.filter(p => p.subject === startDataSubject)
    const startTaskEvents = dependantPublishes.filter(p => p.subject === startTaskSubject)

    assert.equal(startDataEvents.length, 1)
    assert.equal(startTaskEvents.length, 1)
    assert.deepEqual(startDataEvents[0].payload.data, { instanceId: parentInstanceId, stateId: parentDataStateEdgeId })
    assert.deepEqual(startTaskEvents[0].payload.data, { instanceId: parentInstanceId, stateId: parentTaskStateEdgeId })
  })
})
