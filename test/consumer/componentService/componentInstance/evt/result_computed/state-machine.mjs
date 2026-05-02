import test from 'node:test'
import assert from 'node:assert/strict'

import { component as componentBuilder } from '@liquid-bricks/lib-component-builder'

import { componentGates } from '../../../../../../core/componentInstance/cmd/create/loadData/componentGates.js'
import { hasInstanceStarted } from '../../../../../../core/componentInstance/cmd/dependencyUtils.js'
import {
  createBasicSubject,
  withGraphContext,
  registerComponent,
  createInstance,
  startInstance,
  loadImports,
  getComponentId,
  getStateMachineId,
  pickFirst,
  runSpec,
  resultComputedSpec,
  stateMachineCompletedSpec,
  domain,
} from './helpers.mjs'

async function loadGates({ g, componentId }) {
  const { gates = [] } = await componentGates({ rootCtx: { g }, scope: { componentId } })
  return gates
}

async function getGateInstanceId({ g, rootInstanceVertexId, alias }) {
  const [gateInstanceValues] = await g
    .V(rootInstanceVertexId)
    .out(domain.edge.uses_gate.componentInstance_gateInstanceRef.constants.LABEL)
    .filter(_ => _.out(domain.edge.uses_gate.gateInstanceRef_gateRef.constants.LABEL).has('alias', alias))
    .out(domain.edge.uses_gate.gateInstanceRef_componentInstance.constants.LABEL)
    .valueMap('instanceId')
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
    const componentId = await getComponentId({ g, diagnostics, componentHash: component.hash })
    const imports = await loadImports({ g, componentId })
    await createInstance({ diagnostics, dataMapper, g }, { componentHash: component.hash, componentId, instanceId, imports })

    const { stateMachineId } = await getStateMachineId({ g, instanceId })
    await startInstance({ diagnostics, g }, { stateMachineId })

    const published = []
    const resultComputedSubject = createBasicSubject()
      .env('prod')
      .ns('component-service')
      .entity('componentInstance')
      .channel('evt')
      .action('result_computed')
      .version('v1')
      .build()

    let dataAcked = false
    await runSpec({
      spec: resultComputedSpec,
      rootCtx: {
        diagnostics,
        g,
        dataMapper,
        natsContext: { publish: async (subject, payload) => published.push({ subject, payload: JSON.parse(payload) }) },
      },
      message: {
        subject: resultComputedSubject,
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
    assert.equal(dataAcked, true)

    const [runningState] = await g.V(stateMachineId).valueMap('state')
    assert.equal(pickFirst(runningState.state), domain.vertex.stateMachine.constants.STATES.RUNNING)

    let taskAcked = false
    await runSpec({
      spec: resultComputedSpec,
      rootCtx: {
        diagnostics,
        g,
        dataMapper,
        natsContext: { publish: async (subject, payload) => published.push({ subject, payload: JSON.parse(payload) }) },
      },
      message: {
        subject: resultComputedSubject,
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
    assert.equal(taskAcked, true)

    const stateMachineCompletedSubject = createBasicSubject()
      .env('prod')
      .ns('component-service')
      .entity('componentInstance')
      .channel('evt')
      .action('state_machine_completed')
      .version('v1')
      .build()
    const completionEvent = published.find(p => p.subject === stateMachineCompletedSubject)
    assert.ok(completionEvent, 'state_machine_completed event not published')

    let completionAcked = false
    await runSpec({
      spec: stateMachineCompletedSpec,
      rootCtx: { diagnostics, g, dataMapper },
      message: {
        subject: stateMachineCompletedSubject,
        ack: () => { completionAcked = true },
        json: () => completionEvent.payload,
      },
    })
    assert.equal(completionAcked, true)

    const [completedState] = await g.V(stateMachineId).valueMap('state')
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
    const rootComponentId = await getComponentId({ g, diagnostics, componentHash: rootComponent.hash })
    const imports = await loadImports({ g, componentId: rootComponentId })
    const createResult = await createInstance(
      { diagnostics, dataMapper, g },
      { componentHash: rootComponent.hash, componentId: rootComponentId, instanceId: rootInstanceId, imports },
    )
    const childInstanceId = createResult.importedInstances[0].instanceId

    const { stateMachineId: rootStateMachineId } = await getStateMachineId({ g, instanceId: rootInstanceId })
    const { stateMachineId: childStateMachineId } = await getStateMachineId({ g, instanceId: childInstanceId })

    await startInstance({ diagnostics, dataMapper, g }, { stateMachineId: rootStateMachineId })
    await startInstance({ diagnostics, dataMapper, g }, { stateMachineId: childStateMachineId })

    const published = []
    const resultComputedSubject = createBasicSubject()
      .env('prod')
      .ns('component-service')
      .entity('componentInstance')
      .channel('evt')
      .action('result_computed')
      .version('v1')
      .build()
    const stateMachineCompletedSubject = createBasicSubject()
      .env('prod')
      .ns('component-service')
      .entity('componentInstance')
      .channel('evt')
      .action('state_machine_completed')
      .version('v1')
      .build()

    await runSpec({
      spec: resultComputedSpec,
      rootCtx: {
        diagnostics,
        g,
        dataMapper,
        natsContext: { publish: async (subject, payload) => published.push({ subject, payload: JSON.parse(payload) }) },
      },
      message: {
        subject: resultComputedSubject,
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

    for (const event of published.filter(({ subject }) => subject === stateMachineCompletedSubject)) {
      await runSpec({
        spec: stateMachineCompletedSpec,
        rootCtx: { diagnostics, g, dataMapper },
        message: {
          subject: stateMachineCompletedSubject,
          ack: () => { },
          json: () => event.payload,
        },
      })
    }

    const [rootState] = await g
      .V()
      .has('label', domain.vertex.componentInstance.constants.LABEL)
      .has('instanceId', rootInstanceId)
      .out(domain.edge.has_stateMachine.componentInstance_stateMachine.constants.LABEL)
      .valueMap('state')
    const rootStateValue = pickFirst((rootState?.state ?? rootState))
    assert.equal(rootStateValue, domain.vertex.stateMachine.constants.STATES.COMPLETE, 'root instance should be complete')

    const [childState] = await g.V(childStateMachineId).valueMap('state')
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
    const rootComponentId = await getComponentId({ g, diagnostics, componentHash: rootComponent.hash })
    const imports = await loadImports({ g, componentId: rootComponentId })
    const gates = await loadGates({ g, componentId: rootComponentId })
    await createInstance(
      { diagnostics, dataMapper, g },
      { componentHash: rootComponent.hash, componentId: rootComponentId, instanceId: rootInstanceId, imports, gates },
    )

    const { stateMachineId: rootStateMachineId, instanceVertexId: rootInstanceVertexId } = await getStateMachineId({
      g,
      instanceId: rootInstanceId,
    })
    await startInstance({ diagnostics, dataMapper, g }, { stateMachineId: rootStateMachineId })

    const passedGateInstanceId = await getGateInstanceId({ g, rootInstanceVertexId, alias: 'passedGate' })
    const blockedGateInstanceId = await getGateInstanceId({ g, rootInstanceVertexId, alias: 'blockedGate' })
    assert.ok(passedGateInstanceId, 'passed gate instance id missing')
    assert.ok(blockedGateInstanceId, 'blocked gate instance id missing')

    const { stateMachineId: passedGateStateMachineId, instanceVertexId: passedGateInstanceVertexId } = await getStateMachineId({
      g,
      instanceId: passedGateInstanceId,
    })
    const { stateMachineId: blockedGateStateMachineId, instanceVertexId: blockedGateInstanceVertexId } = await getStateMachineId({
      g,
      instanceId: blockedGateInstanceId,
    })

    const published = []
    const resultComputedSubject = createBasicSubject()
      .env('prod')
      .ns('component-service')
      .entity('componentInstance')
      .channel('evt')
      .action('result_computed')
      .version('v1')
      .build()
    const startSubject = createBasicSubject()
      .env('prod')
      .ns('component-service')
      .entity('componentInstance')
      .channel('cmd')
      .action('start')
      .version('v1')
      .build()
    const stateMachineCompletedSubject = createBasicSubject()
      .env('prod')
      .ns('component-service')
      .entity('componentInstance')
      .channel('evt')
      .action('state_machine_completed')
      .version('v1')
      .build()
    const natsContext = {
      publish: async (subject, payload) => published.push({ subject, payload: JSON.parse(payload) }),
    }

    await runSpec({
      spec: resultComputedSpec,
      rootCtx: { diagnostics, g, dataMapper, natsContext },
      message: {
        subject: resultComputedSubject,
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

    const passedGateStartEvent = published.find(({ subject, payload }) =>
      subject === startSubject
      && payload?.data?.instanceId === passedGateInstanceId
    )
    assert.ok(passedGateStartEvent, 'passed gate should start its component instance')

    await startInstance({ diagnostics, dataMapper, g }, { stateMachineId: passedGateStateMachineId })
    const passedGateStarted = await hasInstanceStarted({ g, instanceVertexId: passedGateInstanceVertexId })
    assert.equal(passedGateStarted, true, 'passed gate instance should be started')

    await runSpec({
      spec: resultComputedSpec,
      rootCtx: { diagnostics, g, dataMapper, natsContext },
      message: {
        subject: resultComputedSubject,
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

    const passedGateCompletionEvent = published.find(({ subject, payload }) =>
      subject === stateMachineCompletedSubject
      && payload?.data?.instanceId === passedGateInstanceId
    )
    assert.ok(passedGateCompletionEvent, 'passed gate component should publish completion')
    await runSpec({
      spec: stateMachineCompletedSpec,
      rootCtx: { diagnostics, g, dataMapper },
      message: {
        subject: stateMachineCompletedSubject,
        ack: () => { },
        json: () => passedGateCompletionEvent.payload,
      },
    })

    const prematureRootCompletionEvent = published.find(({ subject, payload }) =>
      subject === stateMachineCompletedSubject
      && payload?.data?.instanceId === rootInstanceId
    )
    assert.equal(prematureRootCompletionEvent, undefined, 'root should not complete before every gate has settled')

    await runSpec({
      spec: resultComputedSpec,
      rootCtx: { diagnostics, g, dataMapper, natsContext },
      message: {
        subject: resultComputedSubject,
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

    const blockedGateStarted = await hasInstanceStarted({ g, instanceVertexId: blockedGateInstanceVertexId })
    assert.equal(blockedGateStarted, false, 'blocked gate instance should not be started')
    const [blockedGateState] = await g.V(blockedGateStateMachineId).valueMap('state')
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
      subject === stateMachineCompletedSubject
      && payload?.data?.instanceId === rootInstanceId
    )
    assert.ok(rootCompletionEvent, 'root should complete after all gates are settled')
    await runSpec({
      spec: stateMachineCompletedSpec,
      rootCtx: { diagnostics, g, dataMapper },
      message: {
        subject: stateMachineCompletedSubject,
        ack: () => { },
        json: () => rootCompletionEvent.payload,
      },
    })

    const [rootState] = await g.V(rootStateMachineId).valueMap('state')
    assert.equal(
      pickFirst(rootState.state),
      domain.vertex.stateMachine.constants.STATES.COMPLETE,
      'root instance should be complete',
    )
  })
})
