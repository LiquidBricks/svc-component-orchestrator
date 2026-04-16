import test from 'node:test'
import assert from 'node:assert/strict'

import { component as componentBuilder } from '@liquid-bricks/lib-component-builder'

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
