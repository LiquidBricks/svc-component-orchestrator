import test from 'node:test'
import assert from 'node:assert/strict'

import { component as componentBuilder } from '@liquid-bricks/lib-component-builder'

import { nodes } from '../../../../../../../data/cmd/start/loadData/nodes.js'
import { componentImports } from '../../../../../../../componentInstance/cmd/create/loadData/componentImports.js'
import {
  withGraphContext,
  registerComponent,
  createInstance,
  domain,
} from '../../../../helpers.mjs'

function pickFirst(value) {
  return Array.isArray(value) ? value[0] : value
}

test('nodes returns component, instance, and data details for state edge', async () => {
  await withGraphContext(async ({ diagnostics, dataMapper, g }) => {
    const component = componentBuilder('DataNodesComponent')
      .data('inputData', { deps: () => { } })
      .toJSON()

    await registerComponent({ diagnostics, dataMapper, g }, component)

    const [componentId] = await g
      .V()
      .has('label', domain.vertex.component.constants.LABEL)
      .has('hash', component.hash)
      .id()

    const { imports } = await componentImports({ rootCtx: { g }, scope: { componentId } })

    const instanceId = 'instance-data-nodes'
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

    const [stateMachineVertexId] = await g
      .V(instanceVertexId)
      .out(domain.edge.has_stateMachine.componentInstance_stateMachine.constants.LABEL)
      .id()

    const [dataStateEdgeId] = await g
      .V(stateMachineVertexId)
      .outE(domain.edge.has_data_state.stateMachine_data.constants.LABEL)
      .id()

    const result = await nodes({
      rootCtx: { g },
      scope: { instanceId, stateId: dataStateEdgeId },
    })

    assert.equal(result.componentInstanceVertexId, instanceVertexId)
    assert.equal(result.componentVertexId, componentId)
    assert.equal(result.stateMachineVertexId, stateMachineVertexId)
    assert.equal(pickFirst(result.name), 'inputData')
    assert.equal(pickFirst(result.componentHash), component.hash)

    const [dataRow] = await g.V(result.dataVertexId).valueMap('name')
    assert.equal(pickFirst(dataRow.name), 'inputData')
  })
})
