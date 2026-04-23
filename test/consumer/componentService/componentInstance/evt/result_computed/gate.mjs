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
  loadImports,
  getComponentId,
  getStateMachineId,
  getImportedInstance,
  pickFirst,
  runSpec,
  resultComputedSpec,
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

test('result_computed with gate=true publishes start for gated instance', async () => {
  await withGraphContext(async ({ diagnostics, dataMapper, g }) => {
    const targetComponent = componentBuilder('GateResultTarget').toJSON()
    const rootComponent = componentBuilder('GateResultRoot')
      .gate('setup', { hash: targetComponent.hash, fnc: () => true })
      .toJSON()

    await registerComponent(targetComponent, { diagnostics, dataMapper, g })
    await registerComponent(rootComponent, { diagnostics, dataMapper, g })

    const rootInstanceId = 'instance-gate-result-true'
    const rootComponentId = await getComponentId({ g, diagnostics, componentHash: rootComponent.hash })
    const imports = await loadImports({ g, componentId: rootComponentId })
    const gates = await loadGates({ g, componentId: rootComponentId })
    await createInstance(
      { diagnostics, dataMapper, g },
      { componentHash: rootComponent.hash, componentId: rootComponentId, instanceId: rootInstanceId, imports, gates },
    )

    const { instanceVertexId: rootInstanceVertexId } = await getStateMachineId({ g, instanceId: rootInstanceId })
    const gateInstanceId = await getGateInstanceId({ g, rootInstanceVertexId, alias: 'setup' })
    assert.ok(gateInstanceId, 'gated instance id missing')

    const resultComputedSubject = createBasicSubject()
      .env('prod')
      .ns('component-service')
      .entity('componentInstance')
      .channel('evt')
      .action('result_computed')
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
            instanceId: rootInstanceId,
            type: 'gate',
            name: 'setup',
            result: true,
          },
        }),
      },
    })
    assert.equal(acked, true)

    const startSubject = createBasicSubject()
      .env('prod')
      .ns('component-service')
      .entity('componentInstance')
      .channel('cmd')
      .action('start')
      .version('v1')
      .build()
    const startEvents = published.filter(({ subject }) => subject === startSubject)
    assert.equal(startEvents.length, 1)
    assert.deepEqual(startEvents[0].payload.data, { instanceId: gateInstanceId })
  })
})

test('result_computed does not publish start_dependants for unstarted gated instances', async () => {
  await withGraphContext(async ({ diagnostics, dataMapper, g }) => {
    const targetComponent = componentBuilder('GateInjectUnstartedTarget')
      .data('value', { deps: () => { } })
      .toJSON()
    const rootComponent = componentBuilder('GateInjectUnstartedRoot')
      .data('simpleCompFalseValue', { deps: () => { }, fnc: () => 'abc-false-gate' })
      .gate('simpleCompFalseGate', {
        hash: targetComponent.hash,
        fnc: () => false,
        inject: _ => [_.simpleCompFalseGate.data.value(_.data.simpleCompFalseValue)],
      })
      .toJSON()

    await registerComponent(targetComponent, { diagnostics, dataMapper, g })
    await registerComponent(rootComponent, { diagnostics, dataMapper, g })

    const rootInstanceId = 'instance-gate-inject-unstarted'
    const rootComponentId = await getComponentId({ g, diagnostics, componentHash: rootComponent.hash })
    const imports = await loadImports({ g, componentId: rootComponentId })
    const gates = await loadGates({ g, componentId: rootComponentId })
    await createInstance(
      { diagnostics, dataMapper, g },
      { componentHash: rootComponent.hash, componentId: rootComponentId, instanceId: rootInstanceId, imports, gates },
    )

    const { instanceVertexId: rootInstanceVertexId } = await getStateMachineId({ g, instanceId: rootInstanceId })
    const gatedInstanceId = await getGateInstanceId({ g, rootInstanceVertexId, alias: 'simpleCompFalseGate' })
    assert.ok(gatedInstanceId, 'gated instance id missing')

    const { instanceVertexId: gatedInstanceVertexId } = await getStateMachineId({ g, instanceId: gatedInstanceId })
    const gatedInstanceStarted = await hasInstanceStarted({ g, instanceVertexId: gatedInstanceVertexId })
    assert.equal(gatedInstanceStarted, false)

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

    const firstRunPublished = []
    await runSpec({
      spec: resultComputedSpec,
      rootCtx: {
        diagnostics,
        g,
        dataMapper,
        natsContext: { publish: async (subject, payload) => firstRunPublished.push({ subject, payload: JSON.parse(payload) }) },
      },
      message: {
        subject: resultComputedSubject,
        ack: () => { },
        json: () => ({
          data: {
            instanceId: rootInstanceId,
            type: 'data',
            name: 'simpleCompFalseValue',
            result: 'abc-false-gate',
          },
        }),
      },
    })

    const injectedGateEvent = firstRunPublished.find(({ subject, payload }) =>
      subject === resultComputedSubject
      && payload?.data?.instanceId === gatedInstanceId
      && payload?.data?.type === 'data'
      && payload?.data?.name === 'value'
    )
    assert.ok(injectedGateEvent, 'expected injected result_computed event for gated instance')

    const secondRunPublished = []
    await runSpec({
      spec: resultComputedSpec,
      rootCtx: {
        diagnostics,
        g,
        dataMapper,
        natsContext: { publish: async (subject, payload) => secondRunPublished.push({ subject, payload: JSON.parse(payload) }) },
      },
      message: {
        subject: resultComputedSubject,
        ack: () => { },
        json: () => injectedGateEvent.payload,
      },
    })

    const startDependantsEvents = secondRunPublished.filter(({ subject }) => subject === startDependantsSubject)
    assert.equal(startDependantsEvents.length, 0)
  })
})

test('result_computed with gate=false does not publish gated instance start', async () => {
  await withGraphContext(async ({ diagnostics, dataMapper, g }) => {
    const targetComponent = componentBuilder('GateResultTargetFalse').toJSON()
    const rootComponent = componentBuilder('GateResultRootFalse')
      .gate('setup', { hash: targetComponent.hash, fnc: () => false })
      .toJSON()

    await registerComponent(targetComponent, { diagnostics, dataMapper, g })
    await registerComponent(rootComponent, { diagnostics, dataMapper, g })

    const rootInstanceId = 'instance-gate-result-false'
    const rootComponentId = await getComponentId({ g, diagnostics, componentHash: rootComponent.hash })
    const imports = await loadImports({ g, componentId: rootComponentId })
    const gates = await loadGates({ g, componentId: rootComponentId })
    await createInstance(
      { diagnostics, dataMapper, g },
      { componentHash: rootComponent.hash, componentId: rootComponentId, instanceId: rootInstanceId, imports, gates },
    )

    const resultComputedSubject = createBasicSubject()
      .env('prod')
      .ns('component-service')
      .entity('componentInstance')
      .channel('evt')
      .action('result_computed')
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
            instanceId: rootInstanceId,
            type: 'gate',
            name: 'setup',
            result: false,
          },
        }),
      },
    })
    assert.equal(acked, true)

    const startSubject = createBasicSubject()
      .env('prod')
      .ns('component-service')
      .entity('componentInstance')
      .channel('cmd')
      .action('start')
      .version('v1')
      .build()
    const startEvents = published.filter(({ subject }) => subject === startSubject)
    assert.equal(startEvents.length, 0)
  })
})

test('result_computed routes gate inject targets by alias when multiple gates share one component hash', async () => {
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
    const rootComponentId = await getComponentId({ g, diagnostics, componentHash: rootComponent.hash })
    const imports = await loadImports({ g, componentId: rootComponentId })
    const gates = await loadGates({ g, componentId: rootComponentId })
    await createInstance(
      { diagnostics, dataMapper, g },
      { componentHash: rootComponent.hash, componentId: rootComponentId, instanceId: rootInstanceId, imports, gates },
    )

    const { instanceVertexId: rootInstanceVertexId } = await getStateMachineId({ g, instanceId: rootInstanceId })
    const gateInstanceByAlias = {
      simpleCompTrueGate: await getGateInstanceId({ g, rootInstanceVertexId, alias: 'simpleCompTrueGate' }),
      simpleCompFalseGate: await getGateInstanceId({ g, rootInstanceVertexId, alias: 'simpleCompFalseGate' }),
      simpleCompThirdGate: await getGateInstanceId({ g, rootInstanceVertexId, alias: 'simpleCompThirdGate' }),
    }
    assert.ok(gateInstanceByAlias.simpleCompTrueGate, 'simpleCompTrueGate instance missing')
    assert.ok(gateInstanceByAlias.simpleCompFalseGate, 'simpleCompFalseGate instance missing')
    assert.ok(gateInstanceByAlias.simpleCompThirdGate, 'simpleCompThirdGate instance missing')

    const resultComputedSubject = createBasicSubject()
      .env('prod')
      .ns('component-service')
      .entity('componentInstance')
      .channel('evt')
      .action('result_computed')
      .version('v1')
      .build()

    const cases = [
      { sourceName: 'simpleCompTrueValue', expectedAlias: 'simpleCompTrueGate', result: 'abc-true-gate' },
      { sourceName: 'simpleCompFalseValue', expectedAlias: 'simpleCompFalseGate', result: 'abc-false-gate' },
      { sourceName: 'simpleCompThirdValue', expectedAlias: 'simpleCompThirdGate', result: 'abc-third-gate' },
    ]

    for (const { sourceName, expectedAlias, result } of cases) {
      const published = []
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
              instanceId: rootInstanceId,
              type: 'data',
              name: sourceName,
              result,
            },
          }),
        },
      })

      const injectedEvents = published.filter(({ subject }) => subject === resultComputedSubject)
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

test('result_computed routes identifier->gate inject to the same pod instance when pod component is imported twice', async () => {
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
    const rootComponentId = await getComponentId({ g, diagnostics, componentHash: rootComponent.hash })
    const imports = await loadImports({ g, componentId: rootComponentId })
    await createInstance(
      { diagnostics, dataMapper, g },
      { componentHash: rootComponent.hash, componentId: rootComponentId, instanceId: rootInstanceId, imports },
    )

    const { instanceVertexId: rootInstanceVertexId } = await getStateMachineId({ g, instanceId: rootInstanceId })

    const resultComputedSubject = createBasicSubject()
      .env('prod')
      .ns('component-service')
      .entity('componentInstance')
      .channel('evt')
      .action('result_computed')
      .version('v1')
      .build()

    const aliases = ['left', 'right']
    for (const alias of aliases) {
      const podInstanceVertexId = await getImportedInstance({ g, rootInstanceVertexId, aliasPath: [alias] })
      assert.ok(podInstanceVertexId, `${alias} pod instance missing`)

      const identifierInstanceVertexId = await getImportedInstance({
        g,
        rootInstanceVertexId: podInstanceVertexId,
        aliasPath: ['identifier'],
      })
      assert.ok(identifierInstanceVertexId, `${alias} identifier instance vertex missing`)

      const [identifierValues] = await g
        .V(identifierInstanceVertexId)
        .valueMap('instanceId')
      const identifierInstanceId = pickFirst(identifierValues?.instanceId ?? identifierValues)
      assert.ok(identifierInstanceId, `${alias} identifier instance missing`)

      const createInstanceId = await getGateInstanceId({ g, rootInstanceVertexId: podInstanceVertexId, alias: 'create' })
      assert.ok(createInstanceId, `${alias} create gate instance missing`)

      const published = []
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
              instanceId: identifierInstanceId,
              type: 'data',
              name: 'id',
              result: { alias },
            },
          }),
        },
      })

      const injectedEvents = published.filter(({ subject, payload }) =>
        subject === resultComputedSubject
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
