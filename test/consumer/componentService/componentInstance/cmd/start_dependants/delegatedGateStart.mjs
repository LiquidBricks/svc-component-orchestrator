import test from 'node:test'
import assert from 'node:assert/strict'

import { component as componentBuilder } from '@liquid-bricks/lib-component-builder'
import { create as createBasicSubject } from '@liquid-bricks/lib-nats-subject/create/basic'
import { events as natsEvents } from '@liquid-bricks/lib-nats-subject/events/nats'

import { handler as startDependantsHandler } from '../../../../../../core/componentInstance/cmd/start_dependants/handler.js'
import { publishStartCommands } from '../../../../../../core/componentInstance/cmd/start_dependants/publishEvents/publishStartCommands.js'
import { spec as startDependantsSpec } from '../../../../../../core/componentInstance/cmd/start_dependants/index.js'
import { componentImports } from '../../../../../../core/componentInstance/cmd/create/loadData/componentImports.js'
import { componentGates } from '../../../../../../core/componentInstance/cmd/create/loadData/componentGates.js'
import { usesGateInstances } from '../../../../../../core/componentInstance/cmd/start/loadData/usesGateInstances.js'
import { handler as startGateHandler } from '../../../../../../core/gate/cmd/start/handler.js'
import { spec as gateStartSpec } from '../../../../../../core/gate/cmd/start/index.js'
import {
  withGraphContext,
  registerComponent,
  createInstance,
  domain,
} from '../../../helpers.mjs'


test('provided dependency delegates gate execution through gate.start', async () => {
  await withGraphContext(async ({ diagnostics, dataMapper, g }) => {
    const gatedComponent = componentBuilder('DelegatedGateTarget').toJSON()
    const rootComponent = componentBuilder('DelegatedGateRoot')
      .data('ready', { deps: () => { } })
      .gate('setup', {
        hash: gatedComponent.hash,
        fnc: () => true,
        waitFor: ({ data }) => data.ready,
        deps: ({ data }) => data.ready,
      })
      .toJSON()

    await registerComponent({ diagnostics, dataMapper, g }, gatedComponent)
    await registerComponent({ diagnostics, dataMapper, g }, rootComponent)

    const [componentId] = await dataMapper.query.findComponentIdByHash({ hash: rootComponent.hash })
    const { imports } = await componentImports({ rootCtx: { g, dataMapper }, scope: { componentId } })
    const { gates } = await componentGates({ rootCtx: { g, dataMapper }, scope: { componentId } })
    const instanceId = 'instance-start-dependants-delegated-gate'

    await createInstance({ diagnostics, dataMapper, g }, {
      componentHash: rootComponent.hash,
      componentId,
      instanceId,
      imports,
      gates,
    })

    const [instanceVertexId] = await dataMapper.query.findInstanceVertexId({ instanceId })
    const [stateMachineId] = await dataMapper.query.readStateMachineId({ vertexId: instanceVertexId })
    const [stateEdgeId] = await dataMapper.query.findDataStateEdgeIdByName({
      vertexId: stateMachineId,
      name: 'ready',
    })
    const [providedNodeId] = await dataMapper.query.findEdgeTargetNodeId({ edgeId: stateEdgeId })
    const { usesGateInstances: gateInstances } = await usesGateInstances({
      rootCtx: { g, dataMapper },
      scope: { instanceVertexId },
    })

    assert.equal(gateInstances.length, 1)
    const gateInstanceId = gateInstances[0].instanceId
    const dependencyResult = { allowed: true }

    await dataMapper.edge.has_data_state.stateMachine_data.setStatusAndResult({
      edgeId: stateEdgeId,
      status: domain.edge.has_data_state.stateMachine_data.constants.Status.PROVIDED,
      result: JSON.stringify(dependencyResult),
    })

    const dependants = await startDependantsHandler({
      rootCtx: { g, dataMapper },
      scope: {
        instanceId,
        instanceVertexId,
        stateMachineId,
        stateEdgeId,
        providedNodeId,
        type: 'data',
      },
    })

    assert.deepEqual(dependants.starters[0].gateInstanceIds, [gateInstanceId])

    const startDependantsPublishes = []
    await publishStartCommands({
      rootCtx: {
        natsContext: {
          publish: async (subject, payload) => {
            startDependantsPublishes.push({ subject, payload: JSON.parse(payload) })
          },
        },
      },
      routeCtx: startDependantsSpec.context,
      scope: dependants,
    })

    const gateStartSubject = createBasicSubject(
      natsEvents['*'].component_service['*']['*'].cmd.gate.start.v1['*'],
    ).forPublish().env('prod').build()
    const gatewaySubject = createBasicSubject(
      natsEvents['*'].gateway['*']['*'].cmd.component.compute_function.v1['*'],
    ).forPublish().env('prod').build()
    const gateStartEvents = startDependantsPublishes.filter(({ subject }) => subject === gateStartSubject)

    assert.equal(gateStartEvents.length, 1)
    assert.deepEqual(gateStartEvents[0].payload.data, {
      instanceId: gateInstanceId,
      parentInstanceId: instanceId,
    })
    assert.equal(
      startDependantsPublishes.filter(({ subject }) => subject === gatewaySubject).length,
      0,
      'start_dependants must not publish the gateway command directly',
    )

    const gatePublishes = []
    await startGateHandler({
      rootCtx: {
        g,
        dataMapper,
        natsContext: {
          publish: async (subject, payload) => {
            gatePublishes.push({ subject, payload: JSON.parse(payload) })
          },
        },
      },
      routeCtx: gateStartSpec.context,
      scope: gateStartEvents[0].payload.data,
    })

    const gatewayEvents = gatePublishes.filter(({ subject }) => subject === gatewaySubject)
    assert.equal(gatewayEvents.length, 1)
    assert.deepEqual(gatewayEvents[0].payload.data, {
      instanceId,
      componentHash: rootComponent.hash,
      name: 'setup',
      type: 'gate',
      deps: {
        data: {
          ready: dependencyResult,
        },
      },
    })
  })
})
