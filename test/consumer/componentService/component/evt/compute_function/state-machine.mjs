import test from 'node:test'
import assert from 'node:assert/strict'
import { component as componentBuilder } from '@liquid-bricks/lib-component-builder'

import { componentGates } from '../../../../../../core/componentInstance/cmd/create/loadData/componentGates.js'
import { hasInstanceStarted } from '../../../../../../core/componentInstance/cmd/dependencyUtils.js'
import {
  createBasicSubject,
  computeFunctionDataSubject,
  computeFunctionGateSubject,
  computeFunctionTaskSubject,
  stateMachineCompletedFactSubject,
  runCheckStateMachineCompletionCommands,
  withGraphContext,
  registerComponent,
  createInstance,
  projectStateMachineStarted,
  loadImports,
  getComponentId,
  getStateMachineId,
  pickFirst,
  runSpec,
  computeFunctionSpec,
  domain,
} from './helpers.mjs'

import { events as natsEvents } from '@liquid-bricks/lib-nats-subject/events/nats'


async function loadGates({ g, dataMapper, componentId }) {
  const { gates = [] } = await componentGates({ rootCtx: { g, dataMapper }, scope: { componentId } })
  return gates
}

async function getGateInstanceId({ g, dataMapper, rootInstanceVertexId, alias }) {
  const [gateInstanceValues] = await dataMapper.query.readGateInstanceValues({ vertexId: rootInstanceVertexId, alias })
  return pickFirst(gateInstanceValues?.instanceId ?? gateInstanceValues)
}

test('stateMachine state switches to complete once all states are provided', async () => {
  await withGraphContext(async ({ diagnostics, dataMapper, g }) => {
    const component = componentBuilder('StateCompleteComponent')
      .data('inputData', { deps: () => { } })
      .task('finalTask', { deps: ({ data }) => data.inputData })
      .toJSON()

    await registerComponent(component, { diagnostics, dataMapper, g })

    const instanceId = 'instance-state-complete'
    const componentId = await getComponentId({ g, dataMapper, diagnostics, componentHash: component.hash })
    const imports = await loadImports({ g, dataMapper, componentId })
    await createInstance({ diagnostics, dataMapper, g }, { componentHash: component.hash, componentId, instanceId, imports })

    const { stateMachineId } = await getStateMachineId({ g, dataMapper, instanceId })
    await projectStateMachineStarted({ dataMapper }, { stateMachineId })

    const published = []
    const computeFunctionSubject = computeFunctionDataSubject
    const rootCtx = {
      diagnostics,
      g,
      dataMapper,
      natsContext: { publish: async (subject, payload) => published.push({ subject, payload: JSON.parse(payload) }) },
    }

    let dataAcked = false
    const dataEventOffset = published.length
    await runSpec({
      spec: computeFunctionSpec,
      rootCtx,
      message: {
        subject: computeFunctionSubject,
        ack: () => { dataAcked = true },
        json: () => ({
          data: {
            instanceId,
            type: 'data',
            name: 'inputData',
            result: { provided: 'data' },
          }
        }),
      },
    })
    await runCheckStateMachineCompletionCommands({ rootCtx, events: published.slice(dataEventOffset) })
    assert.equal(dataAcked, true)

    const [runningState] = await dataMapper.query.readRunningState({ vertexId: stateMachineId })
    assert.equal(pickFirst(runningState.state), domain.vertex.stateMachine.constants.STATES.RUNNING)

    let taskAcked = false
    const taskEventOffset = published.length
    await runSpec({
      spec: computeFunctionSpec,
      rootCtx,
      message: {
        subject: computeFunctionSubject,
        ack: () => { taskAcked = true },
        json: () => ({
          data: {
            instanceId,
            type: 'task',
            name: 'finalTask',
            result: { provided: 'task' },
          }
        }),
      },
    })
    await runCheckStateMachineCompletionCommands({ rootCtx, events: published.slice(taskEventOffset) })
    assert.equal(taskAcked, true)

    const completionFact = published.find(p =>
      p.subject === stateMachineCompletedFactSubject
      && p.payload?.data?.stateMachineId === stateMachineId
    )
    assert.ok(completionFact, 'stateMachine.completed fact not published')

    const [completedState] = await dataMapper.query.readCompletedState({ vertexId: stateMachineId })
    assert.equal(pickFirst(completedState.state), domain.vertex.stateMachine.constants.STATES.COMPLETE)
  })
})

test('componentInstance completes when only imports exist and imports finish', async () => {
  await withGraphContext(async ({ diagnostics, dataMapper, g }) => {
    const importedComponent = componentBuilder('ImportFinishChild')
      .task('done', {})
      .toJSON()
    const rootComponent = componentBuilder('ImportFinishRoot')
      .import('child', { hash: importedComponent.hash })
      .toJSON()

    await registerComponent(importedComponent, { diagnostics, dataMapper, g })
    await registerComponent(rootComponent, { diagnostics, dataMapper, g })

    const rootInstanceId = 'root-import-finish'
    const rootComponentId = await getComponentId({ g, dataMapper, diagnostics, componentHash: rootComponent.hash })
    const imports = await loadImports({ g, dataMapper, componentId: rootComponentId })
    const createResult = await createInstance(
      { diagnostics, dataMapper, g },
      { componentHash: rootComponent.hash, componentId: rootComponentId, instanceId: rootInstanceId, imports },
    )
    const childInstanceId = createResult.importedInstances[0].instanceId

    const { stateMachineId: rootStateMachineId } = await getStateMachineId({ g, dataMapper, instanceId: rootInstanceId })
    const { stateMachineId: childStateMachineId } = await getStateMachineId({ g, dataMapper, instanceId: childInstanceId })

    await projectStateMachineStarted({ dataMapper }, { stateMachineId: rootStateMachineId })
    await projectStateMachineStarted({ dataMapper }, { stateMachineId: childStateMachineId })

    const published = []
    const computeFunctionSubject = computeFunctionDataSubject

    const rootCtx = {
      diagnostics,
      g,
      dataMapper,
      natsContext: { publish: async (subject, payload) => published.push({ subject, payload: JSON.parse(payload) }) },
    }
    await runSpec({
      spec: computeFunctionSpec,
      rootCtx,
      message: {
        subject: computeFunctionSubject,
        ack: () => { },
        json: () => ({
          data: {
            instanceId: childInstanceId,
            type: 'task',
            name: 'done',
            result: { provided: 'child-result' },
          }
        }),
      },
    })
    await runCheckStateMachineCompletionCommands({ rootCtx, events: published })

    const completedInstanceIds = published
      .filter(({ subject }) => subject === stateMachineCompletedFactSubject)
      .map(({ payload }) => payload.data.instanceId)
    assert.deepEqual(
      new Set(completedInstanceIds),
      new Set([childInstanceId, rootInstanceId]),
    )

    const [rootState] = await dataMapper.query.readStateMachineStateByInstanceId({ instanceId: rootInstanceId })
    const rootStateValue = pickFirst((rootState?.state ?? rootState))
    assert.equal(rootStateValue, domain.vertex.stateMachine.constants.STATES.COMPLETE, 'root instance should be complete')

    const [childState] = await dataMapper.query.readChildState({ vertexId: childStateMachineId })
    const childStateValue = pickFirst((childState?.state ?? childState))
    assert.equal(childStateValue, domain.vertex.stateMachine.constants.STATES.COMPLETE, 'child instance should be complete')
  })
})

test('componentInstance completes after false gates settle and true gates complete their instances', async () => {
  await withGraphContext(async ({ diagnostics, dataMapper, g }) => {
    const passedGateComponent = componentBuilder('GateCompletionPassedChild')
      .task('done', {})
      .toJSON()
    const blockedGateComponent = componentBuilder('GateCompletionBlockedChild')
      .task('neverStarted', {})
      .toJSON()
    const rootComponent = componentBuilder('GateCompletionRoot')
      .gate('passedGate', { hash: passedGateComponent.hash, fnc: () => true })
      .gate('blockedGate', { hash: blockedGateComponent.hash, fnc: () => false })
      .toJSON()

    await registerComponent(passedGateComponent, { diagnostics, dataMapper, g })
    await registerComponent(blockedGateComponent, { diagnostics, dataMapper, g })
    await registerComponent(rootComponent, { diagnostics, dataMapper, g })

    const rootInstanceId = 'root-gate-completion'
    const rootComponentId = await getComponentId({ g, dataMapper, diagnostics, componentHash: rootComponent.hash })
    const imports = await loadImports({ g, dataMapper, componentId: rootComponentId })
    const gates = await loadGates({ g, dataMapper, componentId: rootComponentId })
    await createInstance(
      { diagnostics, dataMapper, g },
      { componentHash: rootComponent.hash, componentId: rootComponentId, instanceId: rootInstanceId, imports, gates },
    )

    const { stateMachineId: rootStateMachineId, instanceVertexId: rootInstanceVertexId } = await getStateMachineId({
      g, dataMapper,
      instanceId: rootInstanceId,
    })
    await projectStateMachineStarted({ dataMapper }, { stateMachineId: rootStateMachineId })

    const passedGateInstanceId = await getGateInstanceId({ g, dataMapper, rootInstanceVertexId, alias: 'passedGate' })
    const blockedGateInstanceId = await getGateInstanceId({ g, dataMapper, rootInstanceVertexId, alias: 'blockedGate' })
    assert.ok(passedGateInstanceId, 'passed gate instance id missing')
    assert.ok(blockedGateInstanceId, 'blocked gate instance id missing')

    const { stateMachineId: passedGateStateMachineId, instanceVertexId: passedGateInstanceVertexId } = await getStateMachineId({
      g, dataMapper,
      instanceId: passedGateInstanceId,
    })
    const { stateMachineId: blockedGateStateMachineId, instanceVertexId: blockedGateInstanceVertexId } = await getStateMachineId({
      g, dataMapper,
      instanceId: blockedGateInstanceId,
    })

    const published = []
    const computeFunctionSubject = computeFunctionDataSubject
    const startSubject = createBasicSubject(natsEvents['*'].component_service['*']['*'].cmd.componentInstance.start.v1['*']).forPublish()
      .env('prod')
      .build()
    const natsContext = {
      publish: async (subject, payload) => published.push({ subject, payload: JSON.parse(payload) }),
    }
    const rootCtx = { diagnostics, g, dataMapper, natsContext }

    let completionCommandOffset = published.length
    await runSpec({
      spec: computeFunctionSpec,
      rootCtx,
      message: {
        subject: computeFunctionSubject,
        ack: () => { },
        json: () => ({
          data: {
            instanceId: rootInstanceId,
            type: 'gate',
            name: 'passedGate',
            result: true,
          }
        }),
      },
    })
    await runCheckStateMachineCompletionCommands({
      rootCtx,
      events: published.slice(completionCommandOffset),
    })

    const passedGateStartEvent = published.find(({ subject, payload }) =>
      subject === startSubject
      && payload?.data?.instanceId === passedGateInstanceId
    )
    assert.ok(passedGateStartEvent, 'passed gate should start its component instance')

    await projectStateMachineStarted({ dataMapper }, { stateMachineId: passedGateStateMachineId })
    const passedGateStarted = await hasInstanceStarted({ g, dataMapper, instanceVertexId: passedGateInstanceVertexId })
    assert.equal(passedGateStarted, true, 'passed gate instance should be started')

    completionCommandOffset = published.length
    await runSpec({
      spec: computeFunctionSpec,
      rootCtx,
      message: {
        subject: computeFunctionSubject,
        ack: () => { },
        json: () => ({
          data: {
            instanceId: passedGateInstanceId,
            type: 'task',
            name: 'done',
            result: { ok: true },
          }
        }),
      },
    })
    await runCheckStateMachineCompletionCommands({
      rootCtx,
      events: published.slice(completionCommandOffset),
    })

    const passedGateCompletionEvent = published.find(({ subject, payload }) =>
      subject === stateMachineCompletedFactSubject
      && payload?.data?.instanceId === passedGateInstanceId
    )
    assert.ok(passedGateCompletionEvent, 'passed gate component should publish completion')

    const prematureRootCompletionEvent = published.find(({ subject, payload }) =>
      subject === stateMachineCompletedFactSubject
      && payload?.data?.instanceId === rootInstanceId
    )
    assert.equal(prematureRootCompletionEvent, undefined, 'root should not complete before every gate has settled')

    completionCommandOffset = published.length
    await runSpec({
      spec: computeFunctionSpec,
      rootCtx,
      message: {
        subject: computeFunctionSubject,
        ack: () => { },
        json: () => ({
          data: {
            instanceId: rootInstanceId,
            type: 'gate',
            name: 'blockedGate',
            result: false,
          }
        }),
      },
    })
    await runCheckStateMachineCompletionCommands({
      rootCtx,
      events: published.slice(completionCommandOffset),
    })

    const blockedGateStarted = await hasInstanceStarted({ g, dataMapper, instanceVertexId: blockedGateInstanceVertexId })
    assert.equal(blockedGateStarted, false, 'blocked gate instance should not be started')
    const [blockedGateState] = await dataMapper.query.readBlockedGateState({ vertexId: blockedGateStateMachineId })
    assert.equal(
      pickFirst(blockedGateState.state),
      domain.vertex.stateMachine.constants.STATES.CREATED,
      'blocked gate instance state should remain created',
    )

    const blockedGateStartEvent = published.find(({ subject, payload }) =>
      subject === startSubject
      && payload?.data?.instanceId === blockedGateInstanceId
    )
    assert.equal(blockedGateStartEvent, undefined, 'blocked gate should not publish a start command')

    const rootCompletionEvent = published.find(({ subject, payload }) =>
      subject === stateMachineCompletedFactSubject
      && payload?.data?.instanceId === rootInstanceId
    )
    assert.ok(rootCompletionEvent, 'root should complete after all gates are settled')

    const [rootState] = await dataMapper.query.readStateMachineState({ vertexId: rootStateMachineId })
    assert.equal(
      pickFirst(rootState.state),
      domain.vertex.stateMachine.constants.STATES.COMPLETE,
      'root instance should be complete',
    )
  })
})
