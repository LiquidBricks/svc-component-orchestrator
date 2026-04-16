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
  getStateEdgeId,
  getImportedInstance,
  pickFirst,
  runSpec,
  resultComputedSpec,
  startDependantsSpec,
  startInstanceSpec,
  dataStartSpec,
  STATE_EDGE_STATUS_BY_TYPE,
} from './helpers.mjs'
import { handler as startImportHandler } from '../../../../../../import/cmd/start/handler.js'

test('import start preserves injected data when waitFor delays the import', async () => {
  await withGraphContext(async ({ diagnostics, dataMapper, g }) => {
    const providerComponent = componentBuilder('PreserveProvider')
      .data('podName', { deps: () => { } })
      .toJSON()
    const targetComponent = componentBuilder('PreserveTarget')
      .data('pod', { deps: () => { } })
      .toJSON()
    const rootComponent = componentBuilder('PreserveRoot')
      .import('provider', { hash: providerComponent.hash })
      .import('start', {
        hash: targetComponent.hash,
        waitFor: ({ data }) => data.gate,
        inject: _ => [_.start.data.pod(_.provider.data.podName)],
      })
      .data('gate', { deps: () => { } })
      .toJSON()

    await registerComponent(providerComponent, { diagnostics, dataMapper, g })
    await registerComponent(targetComponent, { diagnostics, dataMapper, g })
    await registerComponent(rootComponent, { diagnostics, dataMapper, g })

    const rootInstanceId = 'instance-preserve-root'
    const rootComponentId = await getComponentId({ g, diagnostics, componentHash: rootComponent.hash })
    const imports = await loadImports({ g, componentId: rootComponentId })
    await createInstance({ diagnostics, dataMapper, g }, { componentHash: rootComponent.hash, componentId: rootComponentId, instanceId: rootInstanceId, imports })

    const { instanceVertexId: rootInstanceVertexId, stateMachineId: rootStateMachineId } = await getStateMachineId({ g, instanceId: rootInstanceId })
    const providerInstanceVertexId = await getImportedInstance({ g, rootInstanceVertexId, aliasPath: ['provider'] })
    const targetInstanceVertexId = await getImportedInstance({ g, rootInstanceVertexId, aliasPath: ['start'] })
    assert.ok(providerInstanceVertexId, 'provider instance missing')
    assert.ok(targetInstanceVertexId, 'target instance missing')

    const [providerInstanceValues] = await g.V(providerInstanceVertexId).valueMap('instanceId')
    const providerInstanceId = pickFirst(providerInstanceValues?.instanceId ?? providerInstanceValues)
    const [targetInstanceValues] = await g.V(targetInstanceVertexId).valueMap('instanceId')
    const targetInstanceId = pickFirst(targetInstanceValues?.instanceId ?? targetInstanceValues)
    assert.ok(providerInstanceId, 'provider instanceId missing')
    assert.ok(targetInstanceId, 'target instanceId missing')

    const { stateMachineId: targetStateMachineId } = await getStateMachineId({ g, instanceId: targetInstanceId })
    const targetDataStateEdgeId = await getStateEdgeId({ g, stateMachineId: targetStateMachineId, type: 'data', name: 'pod' })
    const gateStateEdgeId = await getStateEdgeId({ g, stateMachineId: rootStateMachineId, type: 'data', name: 'gate' })
    assert.ok(targetDataStateEdgeId, 'target data state edge missing')
    assert.ok(gateStateEdgeId, 'gate state edge missing')

    const rootStartSubject = createBasicSubject()
      .env('prod')
      .ns('component-service')
      .entity('componentInstance')
      .channel('cmd')
      .action('start')
      .version('v1')
      .build()
    const importStartSubject = createBasicSubject()
      .env('prod')
      .ns('component-service')
      .entity('import')
      .channel('cmd')
      .action('start')
      .version('v1')
      .build()
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

    const rootStartPublishes = []
    await runSpec({
      spec: startInstanceSpec,
      rootCtx: {
        diagnostics,
        g,
        dataMapper,
        natsContext: { publish: async (subject, payload) => rootStartPublishes.push({ subject, payload: JSON.parse(payload) }) },
      },
      message: {
        subject: rootStartSubject,
        ack: () => { },
        json: () => ({ data: { instanceId: rootInstanceId } }),
      },
    })

    const providerStartCommand = rootStartPublishes.find(({ subject, payload }) => subject === importStartSubject && payload?.data?.instanceId === providerInstanceId)
    assert.ok(providerStartCommand, 'provider import start not published')
    const targetStartCommand = rootStartPublishes.find(({ subject, payload }) => subject === importStartSubject && payload?.data?.instanceId === targetInstanceId)
    assert.ok(targetStartCommand, 'target import command should be published and handled by import.cmd.start')

    const targetPreGatePublishes = []
    await startImportHandler({
      rootCtx: {
        diagnostics,
        g,
        dataMapper,
        natsContext: { publish: async (subject, payload) => targetPreGatePublishes.push({ subject, payload: JSON.parse(payload) }) },
      },
      scope: targetStartCommand.payload.data,
    })
    assert.equal(
      targetPreGatePublishes.filter(({ subject, payload }) =>
        subject === rootStartSubject && payload?.data?.instanceId === targetInstanceId
      ).length,
      0,
      'target import should wait for gate before dispatching componentInstance.start'
    )

    const providerImportStartPublishes = []
    await startImportHandler({
      rootCtx: {
        diagnostics,
        g,
        dataMapper,
        natsContext: { publish: async (subject, payload) => providerImportStartPublishes.push({ subject, payload: JSON.parse(payload) }) },
      },
      scope: providerStartCommand.payload.data,
    })
    const providerComponentStartEvent = providerImportStartPublishes.find(({ subject, payload }) =>
      subject === rootStartSubject && payload?.data?.instanceId === providerInstanceId
    )
    assert.ok(providerComponentStartEvent, 'provider import should dispatch componentInstance.start')

    const providerStartPublishes = []
    await runSpec({
      spec: startInstanceSpec,
      rootCtx: {
        diagnostics,
        g,
        dataMapper,
        natsContext: { publish: async (subject, payload) => providerStartPublishes.push({ subject, payload: JSON.parse(payload) }) },
      },
      message: {
        subject: rootStartSubject,
        ack: () => { },
        json: () => providerComponentStartEvent.payload,
      },
    })
    for (const evt of providerStartPublishes.filter(({ subject }) => subject === startDataSubject)) {
      await runSpec({
        spec: dataStartSpec,
        rootCtx: { diagnostics, g, dataMapper, natsContext: { publish: async () => { } } },
        message: {
          subject: startDataSubject,
          ack: () => { },
          json: () => evt.payload,
        },
      })
    }

    const providerResultPublishes = []
    const podNameResult = { pod: 'import-pod' }
    await runSpec({
      spec: resultComputedSpec,
      rootCtx: {
        diagnostics,
        g,
        dataMapper,
        natsContext: { publish: async (subject, payload) => providerResultPublishes.push({ subject, payload: JSON.parse(payload) }) },
      },
      message: {
        subject: resultComputedSubject,
        ack: () => { },
        json: () => ({
          data: {
            instanceId: providerInstanceId,
            type: 'data',
            name: 'podName',
            result: podNameResult,
          },
        }),
      },
    })

    const injectedEvent = providerResultPublishes.find(({ subject, payload }) =>
      subject === resultComputedSubject
      && payload?.data?.instanceId === targetInstanceId
      && payload?.data?.name === 'pod'
    )
    assert.ok(injectedEvent, 'injected result_computed not published to target import')

    await runSpec({
      spec: resultComputedSpec,
      rootCtx: {
        diagnostics,
        g,
        dataMapper,
        natsContext: { publish: async () => { } },
      },
      message: {
        subject: resultComputedSubject,
        ack: () => { },
        json: () => injectedEvent.payload,
      },
    })

    const [beforeStartValues] = await g.E(targetDataStateEdgeId).valueMap('status', 'result')
    assert.equal(pickFirst(beforeStartValues.status), STATE_EDGE_STATUS_BY_TYPE.data)
    assert.equal(pickFirst(beforeStartValues.result), JSON.stringify(podNameResult))

    const gatePublishes = []
    await runSpec({
      spec: resultComputedSpec,
      rootCtx: {
        diagnostics,
        g,
        dataMapper,
        natsContext: { publish: async (subject, payload) => gatePublishes.push({ subject, payload: JSON.parse(payload) }) },
      },
      message: {
        subject: resultComputedSubject,
        ack: () => { },
        json: () => ({
          data: {
            instanceId: rootInstanceId,
            type: 'data',
            name: 'gate',
            result: { ready: true },
          },
        }),
      },
    })

    const gateStartDependantsEvent = gatePublishes.find(({ subject, payload }) =>
      subject === startDependantsSubject
      && payload?.data?.stateEdgeId === gateStateEdgeId
    )
    assert.ok(gateStartDependantsEvent, 'start_dependants for gate not published')

    const dependantsPublishes = []
    await runSpec({
      spec: startDependantsSpec,
      rootCtx: {
        diagnostics,
        g,
        natsContext: { publish: async (subject, payload) => dependantsPublishes.push({ subject, payload: JSON.parse(payload) }) },
      },
      message: {
        subject: startDependantsSubject,
        ack: () => { },
        json: () => gateStartDependantsEvent.payload,
      },
    })

    const targetStartEvent = dependantsPublishes.find(({ subject, payload }) =>
      subject === importStartSubject
      && payload?.data?.instanceId === targetInstanceId
    )
    assert.ok(targetStartEvent, 'target import start not published after waitFor resolved')

    const targetImportStartPublishes = []
    await startImportHandler({
      rootCtx: {
        diagnostics,
        g,
        dataMapper,
        natsContext: { publish: async (subject, payload) => targetImportStartPublishes.push({ subject, payload: JSON.parse(payload) }) },
      },
      scope: targetStartEvent.payload.data,
    })
    const targetComponentStartEvent = targetImportStartPublishes.find(({ subject, payload }) =>
      subject === rootStartSubject && payload?.data?.instanceId === targetInstanceId
    )
    assert.ok(targetComponentStartEvent, 'target import should dispatch componentInstance.start after waitFor resolves')

    const targetStartPublishes = []
    await runSpec({
      spec: startInstanceSpec,
      rootCtx: {
        diagnostics,
        g,
        dataMapper,
        natsContext: { publish: async (subject, payload) => targetStartPublishes.push({ subject, payload: JSON.parse(payload) }) },
      },
      message: {
        subject: rootStartSubject,
        ack: () => { },
        json: () => targetComponentStartEvent.payload,
      },
    })

    for (const evt of targetStartPublishes.filter(({ subject }) => subject === startDataSubject)) {
      await runSpec({
        spec: dataStartSpec,
        rootCtx: { diagnostics, g, dataMapper, natsContext: { publish: async () => { } } },
        message: {
          subject: startDataSubject,
          ack: () => { },
          json: () => evt.payload,
        },
      })
    }

    const [afterStartValues] = await g.E(targetDataStateEdgeId).valueMap('status', 'result')
    assert.equal(pickFirst(afterStartValues.status), STATE_EDGE_STATUS_BY_TYPE.data)
    assert.equal(pickFirst(afterStartValues.result), JSON.stringify(podNameResult))
  })
})
