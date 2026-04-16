import test from 'node:test'
import assert from 'node:assert/strict'

import { component as componentBuilder } from '@liquid-bricks/lib-component-builder'

import { dependencyResults } from '../../../../../../../data/cmd/start/loadData/dependencyResults.js'
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

test('dependencyResults returns empty deps when data has no dependencies', async () => {
  await withGraphContext(async ({ diagnostics, dataMapper, g }) => {
    const component = componentBuilder('DataDepsComponent')
      .data('rootData', { deps: () => { } })
      .toJSON()

    await registerComponent({ diagnostics, dataMapper, g }, component)

    const [componentId] = await g
      .V()
      .has('label', domain.vertex.component.constants.LABEL)
      .has('hash', component.hash)
      .id()

    const { imports } = await componentImports({ rootCtx: { g }, scope: { componentId } })

    const instanceId = 'instance-data-deps'
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

    const [dataVertexId] = await g.E(dataStateEdgeId).inV().id()

    const { deps } = await dependencyResults({
      rootCtx: { g },
      scope: { componentInstanceVertexId: instanceVertexId, dataVertexId },
    })

    assert.deepEqual(deps, {})

    const [dataRow] = await g.V(dataVertexId).valueMap('name')
    assert.equal(pickFirst(dataRow.name), 'rootData')
  })
})
