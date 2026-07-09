import test from 'node:test'
import assert from 'node:assert/strict'
import { component as componentBuilder } from '@liquid-bricks/lib-component-builder'

import {
  createBasicSubject,
  computeFunctionDataSubject,
  computeFunctionGateSubject,
  computeFunctionTaskSubject,
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
  runInjectResultsCommands,
  computeFunctionSpec,
  startDependantsSpec,
  startInstanceSpec,
  dataStartSpec,
  STATE_EDGE_STATUS_BY_TYPE,
} from './helpers.mjs'
import { handler as startImportHandler } from '../../../../../../core/import/cmd/start/handler.js'

import { events as natsEvents } from '@liquid-bricks/lib-nats-subject/events/nats'


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
    const rootComponentId = await getComponentId({ g, dataMapper, diagnostics, componentHash: rootComponent.hash })
    const imports = await loadImports({ g, dataMapper, componentId: rootComponentId })
    await createInstance({ diagnostics, dataMapper, g }, { componentHash: rootComponent.hash, componentId: rootComponentId, instanceId: rootInstanceId, imports })

    const { instanceVertexId: rootInstanceVertexId, stateMachineId: rootStateMachineId } = await getStateMachineId({ g, dataMapper, instanceId: rootInstanceId })
    const providerInstanceVertexId = await getImportedInstance({ g, dataMapper, rootInstanceVertexId, aliasPath: ['provider'] })
    const targetInstanceVertexId = await getImportedInstance({ g, dataMapper, rootInstanceVertexId, aliasPath: ['start'] })
    assert.ok(providerInstanceVertexId, 'provider instance missing')
    assert.ok(targetInstanceVertexId, 'target instance missing')

    const [providerInstanceValues] = await dataMapper.query.readProviderInstanceValues({ vertexId: providerInstanceVertexId })
    const providerInstanceId = pickFirst(providerInstanceValues?.instanceId ?? providerInstanceValues)
    const [targetInstanceValues] = await dataMapper.query.readTargetInstanceValues({ vertexId: targetInstanceVertexId })
    const targetInstanceId = pickFirst(targetInstanceValues?.instanceId ?? targetInstanceValues)
    assert.ok(providerInstanceId, 'provider instanceId missing')
    assert.ok(targetInstanceId, 'target instanceId missing')

    const { stateMachineId: targetStateMachineId } = await getStateMachineId({ g, dataMapper, instanceId: targetInstanceId })
    const targetDataStateEdgeId = await getStateEdgeId({ g, dataMapper, stateMachineId: targetStateMachineId, type: 'data', name: 'pod' })
    const gateStateEdgeId = await getStateEdgeId({ g, dataMapper, stateMachineId: rootStateMachineId, type: 'data', name: 'gate' })
    assert.ok(targetDataStateEdgeId, 'target data state edge missing')
    assert.ok(gateStateEdgeId, 'gate state edge missing')

    const rootStartSubject = createBasicSubject(natsEvents['*'].component_service['*']['*'].cmd.componentInstance.start.v1['*']).forPublish()
      .env('prod')
      .build()
    const importStartSubject = createBasicSubject(natsEvents['*'].component_service['*']['*'].cmd.import.start.v1['*']).forPublish()
      .env('prod')
      .build()
    const computeFunctionSubject = computeFunctionDataSubject
    const startDependantsSubject = createBasicSubject(natsEvents['*'].component_service['*']['*'].cmd.componentInstance.start_dependants.v1['*']).forPublish()
      .env('prod')
      .build()
    const startDataSubject = createBasicSubject(natsEvents['*'].component_service['*']['*'].cmd.data.start.v1['*']).forPublish()
      .env('prod')
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
    const providerResultRootCtx = {
      diagnostics,
      g,
      dataMapper,
      natsContext: { publish: async (subject, payload) => providerResultPublishes.push({ subject, payload: JSON.parse(payload) }) },
    }
    await runSpec({
      spec: computeFunctionSpec,
      rootCtx: providerResultRootCtx,
      message: {
        subject: computeFunctionSubject,
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

    const providerInjectedPublishes = await runInjectResultsCommands({
      rootCtx: providerResultRootCtx,
      events: providerResultPublishes,
    })
    const injectedEvent = providerInjectedPublishes.find(({ subject, payload }) =>
      subject === computeFunctionSubject
      && payload?.data?.instanceId === targetInstanceId
      && payload?.data?.name === 'pod'
    )
    assert.ok(injectedEvent, 'injected computeFunction not published to target import')

    await runSpec({
      spec: computeFunctionSpec,
      rootCtx: {
        diagnostics,
        g,
        dataMapper,
        natsContext: { publish: async () => { } },
      },
      message: {
        subject: computeFunctionSubject,
        ack: () => { },
        json: () => injectedEvent.payload,
      },
    })

    const [beforeStartValues] = await dataMapper.query.readBeforeStartValues({ edgeId: targetDataStateEdgeId })
    assert.equal(pickFirst(beforeStartValues.status), STATE_EDGE_STATUS_BY_TYPE.data)
    assert.equal(pickFirst(beforeStartValues.result), JSON.stringify(podNameResult))

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
        subject: computeFunctionSubject,
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
        g, dataMapper,
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

    const [afterStartValues] = await dataMapper.query.readAfterStartValues({ edgeId: targetDataStateEdgeId })
    assert.equal(pickFirst(afterStartValues.status), STATE_EDGE_STATUS_BY_TYPE.data)
    assert.equal(pickFirst(afterStartValues.result), JSON.stringify(podNameResult))
  })
})
