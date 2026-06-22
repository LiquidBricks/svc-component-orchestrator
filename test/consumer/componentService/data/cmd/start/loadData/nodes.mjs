import test from 'node:test'
import assert from 'node:assert/strict'

import { component as componentBuilder } from '@liquid-bricks/lib-component-builder'

import { nodes } from '../../../../../../../core/data/cmd/start/loadData/nodes.js'
import { componentImports } from '../../../../../../../core/componentInstance/cmd/create/loadData/componentImports.js'
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

    const [componentId] = await dataMapper.query.findComponentIdByHash({ hash: component.hash })

    const { imports } = await componentImports({ rootCtx: { g, dataMapper }, scope: { componentId } })

    const instanceId = 'instance-data-nodes'
    await createInstance({ diagnostics, dataMapper, g }, {
      componentHash: component.hash,
      componentId,
      instanceId,
      imports,
    })

    const [instanceVertexId] = await dataMapper.query.findInstanceVertexId({ instanceId })

    const [stateMachineVertexId] = await dataMapper.query.readStateMachineVertexId({ vertexId: instanceVertexId })

    const [dataStateEdgeId] = await dataMapper.query.readDataStateEdgeId({ vertexId: stateMachineVertexId })

    const result = await nodes({
      rootCtx: { g, dataMapper },
      scope: { instanceId, stateId: dataStateEdgeId },
    })

    assert.equal(result.componentInstanceVertexId, instanceVertexId)
    assert.equal(result.componentVertexId, componentId)
    assert.equal(result.stateMachineVertexId, stateMachineVertexId)
    assert.equal(pickFirst(result.name), 'inputData')
    assert.equal(pickFirst(result.componentHash), component.hash)

    const [dataRow] = await dataMapper.query.readDataRow({ vertexId: result.dataVertexId })
    assert.equal(pickFirst(dataRow.name), 'inputData')
  })
})
