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
  getImportedInstance,
  pickFirst,
  runSpec,
  resultComputedSpec,
  STATE_EDGE_STATUS_BY_TYPE,
  domain,
} from './helpers.mjs'

test('result_computed publishes injected events across imports using import inject mappings', async () => {
  await withGraphContext(async ({ diagnostics, dataMapper, g }) => {
    const providerComponent = componentBuilder('ImportInjectProviderEvents')
      .task('providerTask', {})
      .data('providerData', { deps: () => { } })
      .toJSON()
    const targetComponent = componentBuilder('ImportInjectTargetEvents')
      .task('targetTask', {})
      .data('targetData', { deps: () => { } })
      .toJSON()
    const rootComponent = componentBuilder('ImportInjectRootEvents')
      .import('target', {
        hash: targetComponent.hash,
        inject: _ => [
          _.provider.data.providerData(_.target.task.targetTask),
          _.data.rootData(_.target.task.targetTask),
          _.provider.task.providerTask(_.target.data.targetData),
        ],
      })
      .import('provider', { hash: providerComponent.hash })
      .data('rootData', { deps: () => { } })
      .toJSON()

    await registerComponent(providerComponent, { diagnostics, dataMapper, g })
    await registerComponent(targetComponent, { diagnostics, dataMapper, g })
    await registerComponent(rootComponent, { diagnostics, dataMapper, g })

    const rootInstanceId = 'instance-import-inject-root-events'
    const rootComponentId = await getComponentId({ g, diagnostics, componentHash: rootComponent.hash })
    const imports = await loadImports({ g, componentId: rootComponentId })
    await createInstance({ diagnostics, dataMapper, g }, { componentHash: rootComponent.hash, componentId: rootComponentId, instanceId: rootInstanceId, imports })

    const { instanceVertexId: rootInstanceVertexId, stateMachineId: rootStateMachineId } = await getStateMachineId({ g, instanceId: rootInstanceId })
    const providerInstanceVertexId = await getImportedInstance({ g, rootInstanceVertexId, aliasPath: ['provider'] })
    const targetInstanceVertexId = await getImportedInstance({ g, rootInstanceVertexId, aliasPath: ['target'] })

    const [providerInstanceValues] = await g.V(providerInstanceVertexId).valueMap('instanceId')
    const providerInstanceId = pickFirst(providerInstanceValues?.instanceId ?? providerInstanceValues)
    const [targetInstanceValues] = await g.V(targetInstanceVertexId).valueMap('instanceId')
    const targetInstanceId = pickFirst(targetInstanceValues?.instanceId ?? targetInstanceValues)

    const { stateMachineId: providerStateMachineId } = await getStateMachineId({ g, instanceId: providerInstanceId })
    const { stateMachineId: targetStateMachineId } = await getStateMachineId({ g, instanceId: targetInstanceId })

    const providerDataStateEdgeId = await getStateEdgeId({ g, stateMachineId: providerStateMachineId, type: 'data', name: 'providerData' })
    const providerTaskStateEdgeId = await getStateEdgeId({ g, stateMachineId: providerStateMachineId, type: 'task', name: 'providerTask' })
    const targetDataStateEdgeId = await getStateEdgeId({ g, stateMachineId: targetStateMachineId, type: 'data', name: 'targetData' })
    const targetTaskStateEdgeId = await getStateEdgeId({ g, stateMachineId: targetStateMachineId, type: 'task', name: 'targetTask' })
    const rootDataStateEdgeId = await getStateEdgeId({ g, stateMachineId: rootStateMachineId, type: 'data', name: 'rootData' })

    assert.ok(providerDataStateEdgeId, 'provider data state edge missing')
    assert.ok(providerTaskStateEdgeId, 'provider task state edge missing')
    assert.ok(targetDataStateEdgeId, 'target data state edge missing')
    assert.ok(targetTaskStateEdgeId, 'target task state edge missing')
    assert.ok(rootDataStateEdgeId, 'root data state edge missing')

    const published = []
    let ackedTargetTask = false
    const resultPayload = { viaImportInject: true }
    const resultComputedSubject = createBasicSubject()
      .env('prod')
      .ns('component-service')
      .entity('componentInstance')
      .channel('evt')
      .action('result_computed')
      .version('v1')
      .build()

    const targetTaskMessage = {
      subject: resultComputedSubject,
      ack: () => { ackedTargetTask = true },
      json: () => ({
        data: {
          instanceId: targetInstanceId,
          type: 'task',
          name: 'targetTask',
          result: resultPayload,
        }
      }),
    }

    await runSpec({
      spec: resultComputedSpec,
      rootCtx: {
        diagnostics,
        g,
        dataMapper,
        natsContext: { publish: async (subject, payload) => published.push({ subject, payload: JSON.parse(payload) }) },
      },
      message: targetTaskMessage,
    })

    assert.equal(ackedTargetTask, true)

    const targetTaskInjectedEvents = published.filter(p => p.subject === resultComputedSubject).map(p => p.payload.data)
    const sortedTaskInjected = targetTaskInjectedEvents.sort((a, b) => a.name.localeCompare(b.name))
    assert.deepEqual(sortedTaskInjected, [
      { instanceId: providerInstanceId, stateId: providerDataStateEdgeId, name: 'providerData', type: 'data', result: resultPayload },
      { instanceId: rootInstanceId, stateId: rootDataStateEdgeId, name: 'rootData', type: 'data', result: resultPayload },
    ])

    published.length = 0
    let ackedTargetData = false
    const targetDataMessage = {
      subject: resultComputedSubject,
      ack: () => { ackedTargetData = true },
      json: () => ({
        data: {
          instanceId: targetInstanceId,
          type: 'data',
          name: 'targetData',
          result: resultPayload,
        }
      }),
    }

    await runSpec({
      spec: resultComputedSpec,
      rootCtx: {
        diagnostics,
        g,
        dataMapper,
        natsContext: { publish: async (subject, payload) => published.push({ subject, payload: JSON.parse(payload) }) },
      },
      message: targetDataMessage,
    })

    assert.equal(ackedTargetData, true)

    const dataInjectedEvents = published.filter(p => p.subject === resultComputedSubject).map(p => p.payload.data)
    assert.deepEqual(dataInjectedEvents, [
      { instanceId: providerInstanceId, stateId: providerTaskStateEdgeId, name: 'providerTask', type: 'task', result: resultPayload },
    ])
  })
})

test('result_computed publishes injected result_computed to imported component instance targets', async () => {
  await withGraphContext(async ({ diagnostics, dataMapper, g }) => {
    const childComponent = componentBuilder('InjectedChild')
      .data('childData', { deps: () => { } })
      .toJSON()
    const rootComponent = componentBuilder('InjectedRoot')
      .import('child', { hash: childComponent.hash })
      .data('rootData', { deps: () => { }, inject: ({ child }) => child.data.childData })
      .toJSON()

    await registerComponent(childComponent, { diagnostics, dataMapper, g })
    await registerComponent(rootComponent, { diagnostics, dataMapper, g })

    const rootInstanceId = 'instance-injected-root'
    const rootComponentId = await getComponentId({ g, diagnostics, componentHash: rootComponent.hash })
    const imports = await loadImports({ g, rootComponentId })
    await createInstance({ diagnostics, dataMapper, g }, { componentHash: rootComponent.hash, componentId: rootComponentId, instanceId: rootInstanceId, imports })

    const { stateMachineId: rootStateMachineId, instanceVertexId: rootInstanceVertexId } = await getStateMachineId({ g, instanceId: rootInstanceId })
    const rootDataStateEdgeId = await getStateEdgeId({ g, stateMachineId: rootStateMachineId, type: 'data', name: 'rootData' })
    assert.ok(rootDataStateEdgeId, 'root data state edge missing')

    const childInstanceVertexId = await getImportedInstance({ g, rootInstanceVertexId, aliasPath: ['child'] })
    assert.ok(childInstanceVertexId, 'child instance missing')

    const [childInstanceIdValues] = await g.V(childInstanceVertexId).valueMap('instanceId')
    const childInstanceId = pickFirst(childInstanceIdValues?.instanceId ?? childInstanceIdValues)
    assert.ok(childInstanceId, 'child instanceId missing')

    const [childStateMachineId] = await g.V(childInstanceVertexId).out(domain.edge.has_stateMachine.componentInstance_stateMachine.constants.LABEL).id()
    const childDataStateEdgeId = await getStateEdgeId({ g, stateMachineId: childStateMachineId, type: 'data', name: 'childData' })

    const published = []
    let acked = false
    const resultPayload = { sentToImport: true }
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
          instanceId: rootInstanceId,
          type: 'data',
          name: 'rootData',
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
    assert.equal(finalScope.stateEdgeId, rootDataStateEdgeId)
    assert.equal(acked, true)

    const [updatedValues] = await g.E(rootDataStateEdgeId).valueMap('status', 'result')
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
    assert.deepEqual(startDependantsEvents[0].payload.data, { instanceId: rootInstanceId, stateEdgeId: rootDataStateEdgeId, type: 'data' })

    assert.equal(injectedEvents.length, 1)
    assert.deepEqual(injectedEvents[0].payload.data, {
      instanceId: childInstanceId,
      stateId: childDataStateEdgeId,
      name: 'childData',
      type: 'data',
      result: resultPayload,
    })
  })
})

test('result_computed skips unreachable injected targets in a different instance context', async () => {
  await withGraphContext(async ({ diagnostics, dataMapper, g }) => {
    const providerComponent = componentBuilder('ImportInjectProviderContextSkip')
      .data('id', { deps: () => { } })
      .toJSON()
    const createComponent = componentBuilder('ImportInjectCreateContextSkip')
      .data('id', { deps: () => { } })
      .toJSON()
    const rootComponent = componentBuilder('ImportInjectRootContextSkip')
      .import('create', {
        hash: createComponent.hash,
        inject: _ => [_.provider.data.id(_.create.data.id)],
      })
      .import('provider', { hash: providerComponent.hash })
      .toJSON()

    await registerComponent(providerComponent, { diagnostics, dataMapper, g })
    await registerComponent(createComponent, { diagnostics, dataMapper, g })
    await registerComponent(rootComponent, { diagnostics, dataMapper, g })

    const providerInstanceId = 'instance-import-inject-provider-context-skip'
    const providerComponentId = await getComponentId({ g, diagnostics, componentHash: providerComponent.hash })
    const providerImports = await loadImports({ g, componentId: providerComponentId })
    await createInstance(
      { diagnostics, dataMapper, g },
      { componentHash: providerComponent.hash, componentId: providerComponentId, instanceId: providerInstanceId, imports: providerImports }
    )

    const { stateMachineId: providerStateMachineId } = await getStateMachineId({ g, instanceId: providerInstanceId })
    const providerDataStateEdgeId = await getStateEdgeId({ g, stateMachineId: providerStateMachineId, type: 'data', name: 'id' })
    assert.ok(providerDataStateEdgeId, 'provider data state edge missing')

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

    const published = []
    let acked = false
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
        ack: () => { acked = true },
        json: () => ({
          data: {
            instanceId: providerInstanceId,
            type: 'data',
            name: 'id',
            result: { context: 'standalone-provider' },
          }
        }),
      },
    })

    assert.equal(acked, true)
    const injectedEvents = published.filter((entry) => entry.subject === resultComputedSubject)
    assert.equal(injectedEvents.length, 0)

    const startDependantsEvents = published.filter((entry) => entry.subject === startDependantsSubject)
    assert.equal(startDependantsEvents.length, 1)
    assert.deepEqual(startDependantsEvents[0].payload.data, {
      instanceId: providerInstanceId,
      stateEdgeId: providerDataStateEdgeId,
      type: 'data',
    })
  })
})
