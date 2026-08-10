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
  startInstanceSpec,
  startDependantsSpec,
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

test('computeFunction with gate=true publishes start for gated instance', async () => {
  await withGraphContext(async ({ diagnostics, dataMapper, g }) => {
    const targetComponent = componentBuilder('GateResultTarget').toJSON()
    const rootComponent = componentBuilder('GateResultRoot')
      .gate('setup', { hash: targetComponent.hash, fnc: () => true })
      .toJSON()

    await registerComponent(targetComponent, { diagnostics, dataMapper, g })
    await registerComponent(rootComponent, { diagnostics, dataMapper, g })

    const rootInstanceId = 'instance-gate-result-true'
    const rootComponentId = await getComponentId({ g, dataMapper, diagnostics, componentHash: rootComponent.hash })
    const imports = await loadImports({ g, dataMapper, componentId: rootComponentId })
    const gates = await loadGates({ g, dataMapper, componentId: rootComponentId })
    await createInstance(
      { diagnostics, dataMapper, g },
      { componentHash: rootComponent.hash, componentId: rootComponentId, instanceId: rootInstanceId, imports, gates },
    )

    const { instanceVertexId: rootInstanceVertexId } = await getStateMachineId({ g, dataMapper, instanceId: rootInstanceId })
    const gateInstanceId = await getGateInstanceId({ g, dataMapper, rootInstanceVertexId, alias: 'setup' })
    assert.ok(gateInstanceId, 'gated instance id missing')

    const computeFunctionSubject = computeFunctionGateSubject

    const published = []
    let acked = false
    await runSpec({
      spec: computeFunctionSpec,
      rootCtx: {
        diagnostics,
        g,
        dataMapper,
        natsContext: { publish: async (subject, payload) => published.push({ subject, payload: JSON.parse(payload) }) },
      },
      message: {
        subject: computeFunctionSubject,
        ack: () => { acked = true },
        json: () => ({
          data: {
            instanceId: rootInstanceId,
            type: 'gate',
            name: 'setup',
            result: true,
            status: 'provided',
          },
        }),
      },
    })
    assert.equal(acked, true)

    const startSubject = createBasicSubject(natsEvents['*'].component_service['*']['*'].cmd.componentInstance.start.v1['*']).forPublish()
      .env('prod')
      .build()
    const startEvents = published.filter(({ subject }) => subject === startSubject)
    assert.equal(startEvents.length, 1)
    assert.deepEqual(startEvents[0].payload.data, { instanceId: gateInstanceId })
  })
})

test('gated instance start releases dependants whose injections were provided before start', async () => {
  await withGraphContext(async ({ diagnostics, dataMapper, g }) => {
    const targetComponent = componentBuilder('GateInjectBeforeStartTarget')
      .data('id', { deps: () => { } })
      .data('podFlags', {
        deps: ({ data }) => data.id,
        fnc: function podFlags() { },
      })
      .toJSON()
    const rootComponent = componentBuilder('GateInjectBeforeStartRoot')
      .data('podId', { deps: () => { }, fnc: () => 'control-plane-id' })
      .gate('create', {
        hash: targetComponent.hash,
        fnc: () => true,
        inject: _ => [_.create.data.id(_.data.podId)],
      })
      .toJSON()

    await registerComponent(targetComponent, { diagnostics, dataMapper, g })
    await registerComponent(rootComponent, { diagnostics, dataMapper, g })

    const rootInstanceId = 'instance-gate-inject-before-start'
    const rootComponentId = await getComponentId({ g, dataMapper, diagnostics, componentHash: rootComponent.hash })
    const imports = await loadImports({ g, dataMapper, componentId: rootComponentId })
    const gates = await loadGates({ g, dataMapper, componentId: rootComponentId })
    await createInstance(
      { diagnostics, dataMapper, g },
      { componentHash: rootComponent.hash, componentId: rootComponentId, instanceId: rootInstanceId, imports, gates },
    )

    const { instanceVertexId: rootInstanceVertexId } = await getStateMachineId({ g, dataMapper, instanceId: rootInstanceId })
    const gatedInstanceId = await getGateInstanceId({ g, dataMapper, rootInstanceVertexId, alias: 'create' })
    assert.ok(gatedInstanceId, 'gated instance id missing')

    const {
      instanceVertexId: gatedInstanceVertexId,
      stateMachineId: gatedStateMachineId,
    } = await getStateMachineId({ g, dataMapper, instanceId: gatedInstanceId })
    const idStateEdgeId = await getStateEdgeId({
      g,
      dataMapper,
      stateMachineId: gatedStateMachineId,
      type: 'data',
      name: 'id',
    })
    const podFlagsStateEdgeId = await getStateEdgeId({
      g,
      dataMapper,
      stateMachineId: gatedStateMachineId,
      type: 'data',
      name: 'podFlags',
    })
    assert.ok(idStateEdgeId, 'id state edge missing')
    assert.ok(podFlagsStateEdgeId, 'podFlags state edge missing')
    const gatedInstanceStarted = await hasInstanceStarted({ g, dataMapper, instanceVertexId: gatedInstanceVertexId })
    assert.equal(gatedInstanceStarted, false)

    const computeFunctionSubject = computeFunctionDataSubject

    const startDependantsSubject = createBasicSubject(natsEvents['*'].component_service['*']['*'].cmd.componentInstance.start_dependants.v1['*']).forPublish()
      .env('prod')
      .build()
    const startInstanceSubject = createBasicSubject(natsEvents['*'].component_service['*']['*'].cmd.componentInstance.start.v1['*']).forPublish()
      .env('prod')
      .build()
    const startDataSubject = createBasicSubject(natsEvents['*'].component_service['*']['*'].cmd.data.start.v1['*']).forPublish()
      .env('prod')
      .build()

    const firstRunPublished = []
    const firstRunRootCtx = {
      diagnostics,
      g,
      dataMapper,
      natsContext: { publish: async (subject, payload) => firstRunPublished.push({ subject, payload: JSON.parse(payload) }) },
    }
    await runSpec({
      spec: computeFunctionSpec,
      rootCtx: firstRunRootCtx,
      message: {
        subject: computeFunctionSubject,
        ack: () => { },
        json: () => ({
          data: {
            instanceId: rootInstanceId,
            type: 'data',
            name: 'podId',
            result: 'control-plane-id',
            status: 'provided',
          },
        }),
      },
    })

    const firstRunInjectedPublishes = await runInjectResultsCommands({
      rootCtx: firstRunRootCtx,
      events: firstRunPublished,
    })
    const injectedGateEvent = firstRunInjectedPublishes.find(({ subject, payload }) =>
      subject === computeFunctionSubject
      && payload?.data?.instanceId === gatedInstanceId
      && payload?.data?.type === 'data'
      && payload?.data?.name === 'id'
    )
    assert.ok(injectedGateEvent, 'expected injected computeFunction event for gated instance')

    const secondRunPublished = []
    await runSpec({
      spec: computeFunctionSpec,
      rootCtx: {
        diagnostics,
        g,
        dataMapper,
        natsContext: { publish: async (subject, payload) => secondRunPublished.push({ subject, payload: JSON.parse(payload) }) },
      },
      message: {
        subject: computeFunctionSubject,
        ack: () => { },
        json: () => injectedGateEvent.payload,
      },
    })

    const startDependantsEvents = secondRunPublished.filter(({ subject }) => subject === startDependantsSubject)
    assert.equal(startDependantsEvents.length, 0)

    const gatePublishes = []
    await runSpec({
      spec: computeFunctionSpec,
      rootCtx: {
        diagnostics,
        g,
        dataMapper,
        natsContext: { publish: async (subject, payload) => gatePublishes.push({ subject, payload: JSON.parse(payload) }) },
      },
      message: {
        subject: computeFunctionGateSubject,
        ack: () => { },
        json: () => ({
          data: {
            instanceId: rootInstanceId,
            type: 'gate',
            name: 'create',
            result: true,
            status: 'provided',
          },
        }),
      },
    })

    const gatedStartEvent = gatePublishes.find(({ subject, payload }) =>
      subject === startInstanceSubject
      && payload?.data?.instanceId === gatedInstanceId
    )
    assert.ok(gatedStartEvent, 'expected gated instance start after gate passed')

    const startedPublishes = []
    await runSpec({
      spec: startInstanceSpec,
      rootCtx: {
        diagnostics,
        g,
        dataMapper,
        natsContext: { publish: async (subject, payload) => startedPublishes.push({ subject, payload: JSON.parse(payload) }) },
      },
      message: {
        subject: startInstanceSubject,
        ack: () => { },
        json: () => gatedStartEvent.payload,
      },
    })

    const initialStateStarts = startedPublishes.filter(({ subject, payload }) =>
      subject === startDataSubject
      && payload?.data?.instanceId === gatedInstanceId
    )
    assert.deepEqual(
      initialStateStarts.map(({ payload }) => payload.data.stateId),
      [idStateEdgeId],
      'instance start should only dispatch the dependency-free id state',
    )

    const replayEvents = startedPublishes.filter(({ subject, payload }) =>
      subject === startDependantsSubject
      && payload?.data?.instanceId === gatedInstanceId
    )
    assert.equal(
      replayEvents.length,
      1,
      'starting an instance with a pre-provided state should replay start_dependants',
    )
    assert.deepEqual(replayEvents[0].payload.data, {
      instanceId: gatedInstanceId,
      stateEdgeId: idStateEdgeId,
      type: 'data',
    })

    const dependantPublishes = []
    await runSpec({
      spec: startDependantsSpec,
      rootCtx: {
        diagnostics,
        g,
        dataMapper,
        natsContext: { publish: async (subject, payload) => dependantPublishes.push({ subject, payload: JSON.parse(payload) }) },
      },
      message: {
        subject: startDependantsSubject,
        ack: () => { },
        json: () => replayEvents[0].payload,
      },
    })

    const podFlagsStarts = dependantPublishes.filter(({ subject, payload }) =>
      subject === startDataSubject
      && payload?.data?.instanceId === gatedInstanceId
      && payload?.data?.stateId === podFlagsStateEdgeId
    )
    assert.deepEqual(podFlagsStarts.map(({ payload }) => payload.data), [{
      instanceId: gatedInstanceId,
      stateId: podFlagsStateEdgeId,
    }])
  })
})

test('computeFunction with gate=false does not publish gated instance start', async () => {
  await withGraphContext(async ({ diagnostics, dataMapper, g }) => {
    const targetComponent = componentBuilder('GateResultTargetFalse').toJSON()
    const rootComponent = componentBuilder('GateResultRootFalse')
      .gate('setup', { hash: targetComponent.hash, fnc: () => false })
      .toJSON()

    await registerComponent(targetComponent, { diagnostics, dataMapper, g })
    await registerComponent(rootComponent, { diagnostics, dataMapper, g })

    const rootInstanceId = 'instance-gate-result-false'
    const rootComponentId = await getComponentId({ g, dataMapper, diagnostics, componentHash: rootComponent.hash })
    const imports = await loadImports({ g, dataMapper, componentId: rootComponentId })
    const gates = await loadGates({ g, dataMapper, componentId: rootComponentId })
    await createInstance(
      { diagnostics, dataMapper, g },
      { componentHash: rootComponent.hash, componentId: rootComponentId, instanceId: rootInstanceId, imports, gates },
    )

    const computeFunctionSubject = computeFunctionGateSubject

    const published = []
    let acked = false
    await runSpec({
      spec: computeFunctionSpec,
      rootCtx: {
        diagnostics,
        g,
        dataMapper,
        natsContext: { publish: async (subject, payload) => published.push({ subject, payload: JSON.parse(payload) }) },
      },
      message: {
        subject: computeFunctionSubject,
        ack: () => { acked = true },
        json: () => ({
          data: {
            instanceId: rootInstanceId,
            type: 'gate',
            name: 'setup',
            result: false,
            status: 'provided',
          },
        }),
      },
    })
    assert.equal(acked, true)

    const startSubject = createBasicSubject(natsEvents['*'].component_service['*']['*'].cmd.componentInstance.start.v1['*']).forPublish()
      .env('prod')
      .build()
    const startEvents = published.filter(({ subject }) => subject === startSubject)
    assert.equal(startEvents.length, 0)
  })
})

test('computeFunction routes gate inject targets by alias when multiple gates share one component hash', async () => {
  await withGraphContext(async ({ diagnostics, dataMapper, g }) => {
    const targetComponent = componentBuilder('GateInjectAliasTarget')
      .data('value', { deps: () => { } })
      .toJSON()
    const rootComponent = componentBuilder('GateInjectAliasRoot')
      .data('simpleCompTrueValue', { deps: () => { }, fnc: () => 'abc-true-gate' })
      .data('simpleCompFalseValue', { deps: () => { }, fnc: () => 'abc-false-gate' })
      .data('simpleCompThirdValue', { deps: () => { }, fnc: () => 'abc-third-gate' })
      .gate('simpleCompTrueGate', {
        hash: targetComponent.hash,
        fnc: () => true,
        inject: _ => [_.simpleCompTrueGate.data.value(_.data.simpleCompTrueValue)],
      })
      .gate('simpleCompFalseGate', {
        hash: targetComponent.hash,
        fnc: () => false,
        inject: _ => [_.simpleCompFalseGate.data.value(_.data.simpleCompFalseValue)],
      })
      .gate('simpleCompThirdGate', {
        hash: targetComponent.hash,
        fnc: () => false,
        inject: _ => [_.simpleCompThirdGate.data.value(_.data.simpleCompThirdValue)],
      })
      .toJSON()

    await registerComponent(targetComponent, { diagnostics, dataMapper, g })
    await registerComponent(rootComponent, { diagnostics, dataMapper, g })

    const rootInstanceId = 'instance-gate-inject-alias-routing'
    const rootComponentId = await getComponentId({ g, dataMapper, diagnostics, componentHash: rootComponent.hash })
    const imports = await loadImports({ g, dataMapper, componentId: rootComponentId })
    const gates = await loadGates({ g, dataMapper, componentId: rootComponentId })
    await createInstance(
      { diagnostics, dataMapper, g },
      { componentHash: rootComponent.hash, componentId: rootComponentId, instanceId: rootInstanceId, imports, gates },
    )

    const { instanceVertexId: rootInstanceVertexId } = await getStateMachineId({ g, dataMapper, instanceId: rootInstanceId })
    const gateInstanceByAlias = {
      simpleCompTrueGate: await getGateInstanceId({ g, dataMapper, rootInstanceVertexId, alias: 'simpleCompTrueGate' }),
      simpleCompFalseGate: await getGateInstanceId({ g, dataMapper, rootInstanceVertexId, alias: 'simpleCompFalseGate' }),
      simpleCompThirdGate: await getGateInstanceId({ g, dataMapper, rootInstanceVertexId, alias: 'simpleCompThirdGate' }),
    }
    assert.ok(gateInstanceByAlias.simpleCompTrueGate, 'simpleCompTrueGate instance missing')
    assert.ok(gateInstanceByAlias.simpleCompFalseGate, 'simpleCompFalseGate instance missing')
    assert.ok(gateInstanceByAlias.simpleCompThirdGate, 'simpleCompThirdGate instance missing')

    const computeFunctionSubject = computeFunctionDataSubject

    const cases = [
      { sourceName: 'simpleCompTrueValue', expectedAlias: 'simpleCompTrueGate', result: 'abc-true-gate' },
      { sourceName: 'simpleCompFalseValue', expectedAlias: 'simpleCompFalseGate', result: 'abc-false-gate' },
      { sourceName: 'simpleCompThirdValue', expectedAlias: 'simpleCompThirdGate', result: 'abc-third-gate' },
    ]

    for (const { sourceName, expectedAlias, result } of cases) {
      const published = []
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
              instanceId: rootInstanceId,
              type: 'data',
              name: sourceName,
              result,
              status: 'provided',
            },
          }),
        },
      })

      const injectedPublishes = await runInjectResultsCommands({ rootCtx, events: published })
      const injectedEvents = injectedPublishes.filter(({ subject }) => subject === computeFunctionSubject)
      assert.equal(injectedEvents.length, 1, `expected one injected result for ${sourceName}`)
      assert.equal(
        injectedEvents[0].payload.data.instanceId,
        gateInstanceByAlias[expectedAlias],
        `expected ${sourceName} to target ${expectedAlias}`,
      )
      assert.equal(injectedEvents[0].payload.data.name, 'value')
      assert.equal(injectedEvents[0].payload.data.type, 'data')
      assert.equal(injectedEvents[0].payload.data.result, result)
    }
  })
})

test('computeFunction routes identifier->gate inject to the same pod instance when pod component is imported twice', async () => {
  await withGraphContext(async ({ diagnostics, dataMapper, g }) => {
    const identifierComponent = componentBuilder('GateInjectSiblingIdentifier')
      .data('id', { deps: () => { }, fnc: function fnIdentifierId() { } })
      .toJSON()
    const createComponent = componentBuilder('GateInjectSiblingCreate')
      .data('id', { deps: () => { }, fnc: function fnCreateId() { } })
      .toJSON()
    const podComponent = componentBuilder('GateInjectSiblingPod')
      .import('identifier', { hash: identifierComponent.hash })
      .gate('create', {
        hash: createComponent.hash,
        fnc: () => true,
        inject: _ => [_.create.data.id(_.identifier.data.id)],
      })
      .toJSON()
    const rootComponent = componentBuilder('GateInjectSiblingRoot')
      .import('left', { hash: podComponent.hash })
      .import('right', { hash: podComponent.hash })
      .toJSON()

    await registerComponent(identifierComponent, { diagnostics, dataMapper, g })
    await registerComponent(createComponent, { diagnostics, dataMapper, g })
    await registerComponent(podComponent, { diagnostics, dataMapper, g })
    await registerComponent(rootComponent, { diagnostics, dataMapper, g })

    const rootInstanceId = 'instance-gate-inject-sibling-routing'
    const rootComponentId = await getComponentId({ g, dataMapper, diagnostics, componentHash: rootComponent.hash })
    const imports = await loadImports({ g, dataMapper, componentId: rootComponentId })
    await createInstance(
      { diagnostics, dataMapper, g },
      { componentHash: rootComponent.hash, componentId: rootComponentId, instanceId: rootInstanceId, imports },
    )

    const { instanceVertexId: rootInstanceVertexId } = await getStateMachineId({ g, dataMapper, instanceId: rootInstanceId })

    const computeFunctionSubject = computeFunctionDataSubject

    const aliases = ['left', 'right']
    for (const alias of aliases) {
      const podInstanceVertexId = await getImportedInstance({ g, dataMapper, rootInstanceVertexId, aliasPath: [alias] })
      assert.ok(podInstanceVertexId, `${alias} pod instance missing`)

      const identifierInstanceVertexId = await getImportedInstance({
        g, dataMapper,
        rootInstanceVertexId: podInstanceVertexId,
        aliasPath: ['identifier'],
      })
      assert.ok(identifierInstanceVertexId, `${alias} identifier instance vertex missing`)

      const [identifierValues] = await dataMapper.query.readIdentifierValues({ vertexId: identifierInstanceVertexId })
      const identifierInstanceId = pickFirst(identifierValues?.instanceId ?? identifierValues)
      assert.ok(identifierInstanceId, `${alias} identifier instance missing`)

      const createInstanceId = await getGateInstanceId({ g, dataMapper, rootInstanceVertexId: podInstanceVertexId, alias: 'create' })
      assert.ok(createInstanceId, `${alias} create gate instance missing`)

      const published = []
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
              instanceId: identifierInstanceId,
              type: 'data',
              name: 'id',
              result: { alias },
              status: 'provided',
            },
          }),
        },
      })

      const injectedPublishes = await runInjectResultsCommands({ rootCtx, events: published })
      const injectedEvents = injectedPublishes.filter(({ subject, payload }) =>
        subject === computeFunctionSubject
        && payload?.data?.type === 'data'
        && payload?.data?.name === 'id'
      )
      assert.equal(injectedEvents.length, 1, `expected one injected event for ${alias}`)
      assert.equal(
        injectedEvents[0].payload.data.instanceId,
        createInstanceId,
        `expected ${alias}.identifier to inject into ${alias}.create`,
      )
      assert.deepEqual(injectedEvents[0].payload.data.result, { alias })
    }
  })
})
