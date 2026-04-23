import test from 'node:test'
import assert from 'node:assert/strict'

import { component as componentBuilder } from '@liquid-bricks/lib-component-builder'

import { handler } from '../../../../../../core/componentInstance/cmd/start_dependants/handler.js'
import { componentImports } from '../../../../../../core/componentInstance/cmd/create/loadData/componentImports.js'
import { componentGates } from '../../../../../../core/componentInstance/cmd/create/loadData/componentGates.js'
import { STATE_EDGE_LABEL_BY_TYPE } from '../../../../../../core/componentInstance/cmd/start_dependants/constants.js'
import {
  withGraphContext,
  registerComponent,
  createInstance,
  domain,
} from '../../../helpers.mjs'


test('handler returns starter list when no dependants are ready', async () => {
  await withGraphContext(async ({ diagnostics, dataMapper, g }) => {
    const component = componentBuilder('StartDependantsComponent')
      .data('rootData', { deps: () => { } })
      .toJSON()

    await registerComponent({ diagnostics, dataMapper, g }, component)

    const [componentId] = await g
      .V()
      .has('label', domain.vertex.component.constants.LABEL)
      .has('hash', component.hash)
      .id()

    const { imports } = await componentImports({ rootCtx: { g }, scope: { componentId } })

    const instanceId = 'instance-start-dependants'
    await createInstance({ diagnostics, dataMapper, g }, {
      componentHash: component.hash,
      componentId,
      instanceId,
      imports,
    })

    const [instanceVertexId] = await g
      .V()
      .has('label', domain.vertex.componentInstance.constants.LABEL)
      .has('instanceId', instanceId)
      .id()

    const [stateMachineId] = await g
      .V(instanceVertexId)
      .out(domain.edge.has_stateMachine.componentInstance_stateMachine.constants.LABEL)
      .id()

    const [stateEdgeId] = await g
      .V(stateMachineId)
      .outE(STATE_EDGE_LABEL_BY_TYPE.data)
      .id()

    const [providedNodeId] = await g.E(stateEdgeId).inV().id()

    const { starters } = await handler({
      rootCtx: { g },
      scope: {
        instanceId,
        instanceVertexId,
        stateMachineId,
        providedNodeId,
        type: 'data',
      },
    })

    assert.equal(starters.length, 1)
    assert.equal(starters[0].instanceId, instanceId)
    assert.deepEqual(starters[0].dataStateIds, [])
    assert.deepEqual(starters[0].taskStateIds, [])
  })
})

test('handler returns gate compute requests and does not evaluate gate fnc on consumer', async () => {
  await withGraphContext(async ({ diagnostics, dataMapper, g }) => {
    const gateAllowTarget = componentBuilder('GateAllowTarget').toJSON()
    const gateDenyTarget = componentBuilder('GateDenyTarget').toJSON()
    const component = componentBuilder('StartDependantsGateConditions')
      .data('rootData', { deps: () => { } })
      .gate('allow', { hash: gateAllowTarget.hash, fnc: () => true })
      .gate('deny', { hash: gateDenyTarget.hash, fnc: () => false })
      .toJSON()

    await registerComponent({ diagnostics, dataMapper, g }, gateAllowTarget)
    await registerComponent({ diagnostics, dataMapper, g }, gateDenyTarget)
    await registerComponent({ diagnostics, dataMapper, g }, component)

    const [componentId] = await g
      .V()
      .has('label', domain.vertex.component.constants.LABEL)
      .has('hash', component.hash)
      .id()

    const { imports } = await componentImports({ rootCtx: { g }, scope: { componentId } })
    const { gates } = await componentGates({ rootCtx: { g }, scope: { componentId } })

    const instanceId = 'instance-start-dependants-gates'
    await createInstance({ diagnostics, dataMapper, g }, {
      componentHash: component.hash,
      componentId,
      instanceId,
      imports,
      gates,
    })

    const [instanceVertexId] = await g
      .V()
      .has('label', domain.vertex.componentInstance.constants.LABEL)
      .has('instanceId', instanceId)
      .id()

    const [stateMachineId] = await g
      .V(instanceVertexId)
      .out(domain.edge.has_stateMachine.componentInstance_stateMachine.constants.LABEL)
      .id()

    const [stateEdgeId] = await g
      .V(stateMachineId)
      .outE(STATE_EDGE_LABEL_BY_TYPE.data)
      .id()
    const [providedNodeId] = await g.E(stateEdgeId).inV().id()

    const { starters } = await handler({
      rootCtx: { g },
      scope: {
        instanceId,
        instanceVertexId,
        stateMachineId,
        providedNodeId,
        type: 'data',
      },
    })

    assert.equal(starters.length, 1)
    assert.equal(starters[0].instanceId, instanceId)
    const gateRequests = starters[0].gateStartRequests ?? []
    assert.equal(gateRequests.length, 2)
    assert.deepEqual(gateRequests.map(({ name }) => name).sort(), ['allow', 'deny'])
    assert.ok(gateRequests.every(({ type }) => type === 'gate'))
    assert.ok(gateRequests.every(({ instanceId: requestInstanceId }) => requestInstanceId === instanceId))
    assert.ok(gateRequests.every(({ componentHash }) => componentHash === component.hash))
  })
})
