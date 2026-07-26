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
  getImportedInstance,
  pickFirst,
  runSpec,
  runInjectResultsCommands,
  computeFunctionSpec,
  STATE_EDGE_STATUS_BY_TYPE,
  domain,
} from './helpers.mjs'

import { events as natsEvents } from '@liquid-bricks/lib-nats-subject/events/nats'


test('computeFunction publishes injected events across imports using import inject mappings', async () => {
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
    const rootComponentId = await getComponentId({ g, dataMapper, diagnostics, componentHash: rootComponent.hash })
    const componentRouting = await dataMapper.vertex.component.index.injectionRouting.read({
      componentId: rootComponentId,
    })
    assert.equal(componentRouting.routes.length, 3)

    const imports = await loadImports({ g, dataMapper, componentId: rootComponentId })
    await createInstance({ diagnostics, dataMapper, g }, { componentHash: rootComponent.hash, componentId: rootComponentId, instanceId: rootInstanceId, imports })

    const { instanceVertexId: rootInstanceVertexId, stateMachineId: rootStateMachineId } = await getStateMachineId({ g, dataMapper, instanceId: rootInstanceId })
    const providerInstanceVertexId = await getImportedInstance({ g, dataMapper, rootInstanceVertexId, aliasPath: ['provider'] })
    const targetInstanceVertexId = await getImportedInstance({ g, dataMapper, rootInstanceVertexId, aliasPath: ['target'] })

    const [providerInstanceValues] = await dataMapper.query.readProviderInstanceValues({ vertexId: providerInstanceVertexId })
    const providerInstanceId = pickFirst(providerInstanceValues?.instanceId ?? providerInstanceValues)
    const [targetInstanceValues] = await dataMapper.query.readTargetInstanceValues({ vertexId: targetInstanceVertexId })
    const targetInstanceId = pickFirst(targetInstanceValues?.instanceId ?? targetInstanceValues)

    const { stateMachineId: providerStateMachineId } = await getStateMachineId({ g, dataMapper, instanceId: providerInstanceId })
    const { stateMachineId: targetStateMachineId } = await getStateMachineId({ g, dataMapper, instanceId: targetInstanceId })

    const providerDataStateEdgeId = await getStateEdgeId({ g, dataMapper, stateMachineId: providerStateMachineId, type: 'data', name: 'providerData' })
    const providerTaskStateEdgeId = await getStateEdgeId({ g, dataMapper, stateMachineId: providerStateMachineId, type: 'task', name: 'providerTask' })
    const targetDataStateEdgeId = await getStateEdgeId({ g, dataMapper, stateMachineId: targetStateMachineId, type: 'data', name: 'targetData' })
    const targetTaskStateEdgeId = await getStateEdgeId({ g, dataMapper, stateMachineId: targetStateMachineId, type: 'task', name: 'targetTask' })
    const rootDataStateEdgeId = await getStateEdgeId({ g, dataMapper, stateMachineId: rootStateMachineId, type: 'data', name: 'rootData' })

    assert.ok(providerDataStateEdgeId, 'provider data state edge missing')
    assert.ok(providerTaskStateEdgeId, 'provider task state edge missing')
    assert.ok(targetDataStateEdgeId, 'target data state edge missing')
    assert.ok(targetTaskStateEdgeId, 'target task state edge missing')
    assert.ok(rootDataStateEdgeId, 'root data state edge missing')

    const targetTaskRouting = await dataMapper.vertex.componentInstance.index.injectionRouting.lookup({
      instanceId: targetInstanceId,
      instanceVertexId: targetInstanceVertexId,
      stateMachineId: targetStateMachineId,
      stateEdgeId: targetTaskStateEdgeId,
      type: 'task',
    })
    assert.deepEqual(
      targetTaskRouting.targets
        .map(target => `${target.instanceId}:${target.stateEdgeId}:${target.type}:${target.name}`)
        .sort(),
      [
        `${providerInstanceId}:${providerDataStateEdgeId}:data:providerData`,
        `${rootInstanceId}:${rootDataStateEdgeId}:data:rootData`,
      ].sort(),
    )

    const published = []
    let ackedTargetTask = false
    const resultPayload = { viaImportInject: true }
    const computeFunctionSubject = computeFunctionDataSubject
    const computeFunctionSubjects = new Set([computeFunctionSubject, computeFunctionTaskSubject])

    const rootCtx = {
      diagnostics,
      g,
      dataMapper,
      natsContext: { publish: async (subject, payload) => published.push({ subject, payload: JSON.parse(payload) }) },
    }

    const targetTaskMessage = {
      subject: computeFunctionSubject,
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
      spec: computeFunctionSpec,
      rootCtx,
      message: targetTaskMessage,
    })

    assert.equal(ackedTargetTask, true)

    const targetTaskInjectedPublishes = await runInjectResultsCommands({ rootCtx, events: published })
    const targetTaskInjectedEvents = targetTaskInjectedPublishes.filter(p => computeFunctionSubjects.has(p.subject)).map(p => p.payload.data)
    const sortedTaskInjected = targetTaskInjectedEvents.sort((a, b) => a.name.localeCompare(b.name))
    assert.deepEqual(sortedTaskInjected, [
      { instanceId: providerInstanceId, stateId: providerDataStateEdgeId, name: 'providerData', type: 'data', result: resultPayload },
      { instanceId: rootInstanceId, stateId: rootDataStateEdgeId, name: 'rootData', type: 'data', result: resultPayload },
    ])

    published.length = 0
    let ackedTargetData = false
    const targetDataMessage = {
      subject: computeFunctionSubject,
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
      spec: computeFunctionSpec,
      rootCtx,
      message: targetDataMessage,
    })

    assert.equal(ackedTargetData, true)

    const targetDataInjectedPublishes = await runInjectResultsCommands({ rootCtx, events: published })
    const dataInjectedEvents = targetDataInjectedPublishes.filter(p => computeFunctionSubjects.has(p.subject)).map(p => p.payload.data)
    assert.deepEqual(dataInjectedEvents, [
      { instanceId: providerInstanceId, stateId: providerTaskStateEdgeId, name: 'providerTask', type: 'task', result: resultPayload },
    ])
  })
})

test('bound injection routing isolates repeated imports by their owner-relative aliases', async () => {
  await withGraphContext(async ({ diagnostics, dataMapper, g }) => {
    const childComponent = componentBuilder('RepeatedInjectionChild')
      .data('source', { deps: () => { } })
      .data('target', { deps: () => { } })
      .toJSON()
    const rootComponent = componentBuilder('RepeatedInjectionRoot')
      .import('left', {
        hash: childComponent.hash,
        inject: _ => [_.right.data.target(_.left.data.source)],
      })
      .import('right', { hash: childComponent.hash })
      .toJSON()

    await registerComponent(childComponent, { diagnostics, dataMapper, g })
    await registerComponent(rootComponent, { diagnostics, dataMapper, g })

    const rootComponentId = await getComponentId({
      g,
      dataMapper,
      diagnostics,
      componentHash: rootComponent.hash,
    })
    const componentRouting = await dataMapper.vertex.component.index.injectionRouting.read({
      componentId: rootComponentId,
    })
    assert.deepEqual(componentRouting.routes.map(route => ({
      source: route.source.aliasPath,
      target: route.target.aliasPath,
    })), [{ source: ['left'], target: ['right'] }])

    const rootInstanceId = 'instance-repeated-injection-root'
    const imports = await loadImports({ g, dataMapper, componentId: rootComponentId })
    await createInstance(
      { diagnostics, dataMapper, g },
      {
        componentHash: rootComponent.hash,
        componentId: rootComponentId,
        instanceId: rootInstanceId,
        imports,
      },
    )

    const { instanceVertexId: rootInstanceVertexId } = await getStateMachineId({
      g,
      dataMapper,
      instanceId: rootInstanceId,
    })
    const leftInstanceVertexId = await getImportedInstance({
      g,
      dataMapper,
      rootInstanceVertexId,
      aliasPath: ['left'],
    })
    const rightInstanceVertexId = await getImportedInstance({
      g,
      dataMapper,
      rootInstanceVertexId,
      aliasPath: ['right'],
    })

    const [leftValues] = await dataMapper.query.readComponentInstanceId({
      vertexId: leftInstanceVertexId,
    })
    const [rightValues] = await dataMapper.query.readComponentInstanceId({
      vertexId: rightInstanceVertexId,
    })
    const leftInstanceId = pickFirst(leftValues?.instanceId ?? leftValues)
    const rightInstanceId = pickFirst(rightValues?.instanceId ?? rightValues)
    const { stateMachineId: leftStateMachineId } = await getStateMachineId({
      g,
      dataMapper,
      instanceId: leftInstanceId,
    })
    const { stateMachineId: rightStateMachineId } = await getStateMachineId({
      g,
      dataMapper,
      instanceId: rightInstanceId,
    })
    const leftSourceStateEdgeId = await getStateEdgeId({
      g,
      dataMapper,
      stateMachineId: leftStateMachineId,
      type: 'data',
      name: 'source',
    })
    const rightSourceStateEdgeId = await getStateEdgeId({
      g,
      dataMapper,
      stateMachineId: rightStateMachineId,
      type: 'data',
      name: 'source',
    })
    const rightTargetStateEdgeId = await getStateEdgeId({
      g,
      dataMapper,
      stateMachineId: rightStateMachineId,
      type: 'data',
      name: 'target',
    })

    const leftRouting = await dataMapper.vertex.componentInstance.index.injectionRouting.lookup({
      instanceId: leftInstanceId,
      instanceVertexId: leftInstanceVertexId,
      stateMachineId: leftStateMachineId,
      stateEdgeId: leftSourceStateEdgeId,
      type: 'data',
    })
    assert.deepEqual(
      leftRouting.targets.map(target => ({
        instanceId: target.instanceId,
        stateEdgeId: target.stateEdgeId,
        name: target.name,
        type: target.type,
      })),
      [{
        instanceId: rightInstanceId,
        stateEdgeId: rightTargetStateEdgeId,
        name: 'target',
        type: 'data',
      }],
    )

    const rightRouting = await dataMapper.vertex.componentInstance.index.injectionRouting.lookup({
      instanceId: rightInstanceId,
      instanceVertexId: rightInstanceVertexId,
      stateMachineId: rightStateMachineId,
      stateEdgeId: rightSourceStateEdgeId,
      type: 'data',
    })
    assert.deepEqual(rightRouting.targets, [])
  })
})

test('computeFunction publishes injected computeFunction to imported component instance targets', async () => {
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
    const rootComponentId = await getComponentId({ g, dataMapper, diagnostics, componentHash: rootComponent.hash })
    const imports = await loadImports({ g, dataMapper, rootComponentId })
    await createInstance({ diagnostics, dataMapper, g }, { componentHash: rootComponent.hash, componentId: rootComponentId, instanceId: rootInstanceId, imports })

    const { stateMachineId: rootStateMachineId, instanceVertexId: rootInstanceVertexId } = await getStateMachineId({ g, dataMapper, instanceId: rootInstanceId })
    const rootDataStateEdgeId = await getStateEdgeId({ g, dataMapper, stateMachineId: rootStateMachineId, type: 'data', name: 'rootData' })
    assert.ok(rootDataStateEdgeId, 'root data state edge missing')

    const childInstanceVertexId = await getImportedInstance({ g, dataMapper, rootInstanceVertexId, aliasPath: ['child'] })
    assert.ok(childInstanceVertexId, 'child instance missing')

    const [childInstanceIdValues] = await dataMapper.query.readChildInstanceIdValues({ vertexId: childInstanceVertexId })
    const childInstanceId = pickFirst(childInstanceIdValues?.instanceId ?? childInstanceIdValues)
    assert.ok(childInstanceId, 'child instanceId missing')

    const [childStateMachineId] = await dataMapper.query.readChildStateMachineId({ vertexId: childInstanceVertexId })
    const childDataStateEdgeId = await getStateEdgeId({ g, dataMapper, stateMachineId: childStateMachineId, type: 'data', name: 'childData' })

    const published = []
    let acked = false
    const resultPayload = { sentToImport: true }
    const message = {
      subject: computeFunctionDataSubject,
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

    const finalScope = await runSpec({ spec: computeFunctionSpec, rootCtx, message })
    assert.equal(finalScope.stateEdgeId, rootDataStateEdgeId)
    assert.equal(acked, true)

    const [updatedValues] = await dataMapper.query.readStateEdgeStatusAndResult({ edgeId: rootDataStateEdgeId })
    assert.equal(pickFirst(updatedValues.status), STATE_EDGE_STATUS_BY_TYPE.data)
    assert.equal(pickFirst(updatedValues.result), JSON.stringify(resultPayload))

    const computeFunctionSubject = computeFunctionDataSubject
    const startDependantsSubject = createBasicSubject(natsEvents['*'].component_service['*']['*'].cmd.componentInstance.start_dependants.v1['*']).forPublish()
      .env('prod')
      .build()

    const injectedPublishes = await runInjectResultsCommands({ rootCtx, events: published })
    const injectedEvents = injectedPublishes.filter(p => p.subject === computeFunctionSubject)
    const startDependantsEvents = published.filter(p => p.subject === startDependantsSubject)

    assert.equal(startDependantsEvents.length, 1)
    assertDataStartDependantsPayload(startDependantsEvents[0].payload.data, {
      instanceId: rootInstanceId,
      stateEdgeId: rootDataStateEdgeId,
    })

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

test('computeFunction skips unreachable injected targets in a different instance context', async () => {
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
    const providerComponentId = await getComponentId({ g, dataMapper, diagnostics, componentHash: providerComponent.hash })
    const providerImports = await loadImports({ g, dataMapper, componentId: providerComponentId })
    await createInstance(
      { diagnostics, dataMapper, g },
      { componentHash: providerComponent.hash, componentId: providerComponentId, instanceId: providerInstanceId, imports: providerImports }
    )

    const { stateMachineId: providerStateMachineId } = await getStateMachineId({ g, dataMapper, instanceId: providerInstanceId })
    const providerDataStateEdgeId = await getStateEdgeId({ g, dataMapper, stateMachineId: providerStateMachineId, type: 'data', name: 'id' })
    assert.ok(providerDataStateEdgeId, 'provider data state edge missing')

    const computeFunctionSubject = computeFunctionDataSubject
    const startDependantsSubject = createBasicSubject(natsEvents['*'].component_service['*']['*'].cmd.componentInstance.start_dependants.v1['*']).forPublish()
      .env('prod')
      .build()

    const published = []
    const rootCtx = {
      diagnostics,
      g,
      dataMapper,
      natsContext: { publish: async (subject, payload) => published.push({ subject, payload: JSON.parse(payload) }) },
    }
    let acked = false
    await runSpec({
      spec: computeFunctionSpec,
      rootCtx,
      message: {
        subject: computeFunctionSubject,
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
    const injectedPublishes = await runInjectResultsCommands({ rootCtx, events: published })
    const injectedEvents = injectedPublishes.filter((entry) => entry.subject === computeFunctionSubject)
    assert.equal(injectedEvents.length, 0)

    const startDependantsEvents = published.filter((entry) => entry.subject === startDependantsSubject)
    assert.equal(startDependantsEvents.length, 1)
    assertDataStartDependantsPayload(startDependantsEvents[0].payload.data, {
      instanceId: providerInstanceId,
      stateEdgeId: providerDataStateEdgeId,
    })
  })
})
