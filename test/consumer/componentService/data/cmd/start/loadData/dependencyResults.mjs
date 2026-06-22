import test from 'node:test'
import assert from 'node:assert/strict'

import { component as componentBuilder } from '@liquid-bricks/lib-component-builder'

import { dependencyResults } from '../../../../../../../core/data/cmd/start/loadData/dependencyResults.js'
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

test('dependencyResults returns empty deps when data has no dependencies', async () => {
  await withGraphContext(async ({ diagnostics, dataMapper, g }) => {
    const component = componentBuilder('DataDepsComponent')
      .data('rootData', { deps: () => { } })
      .toJSON()

    await registerComponent({ diagnostics, dataMapper, g }, component)

    const [componentId] = await dataMapper.query.findComponentIdByHash({ hash: component.hash })

    const { imports } = await componentImports({ rootCtx: { g, dataMapper }, scope: { componentId } })

    const instanceId = 'instance-data-deps'
    await createInstance({ diagnostics, dataMapper, g }, {
      componentHash: component.hash,
      componentId,
      instanceId,
      imports,
    })

    const [instanceVertexId] = await dataMapper.query.findInstanceVertexId({ instanceId })

    const [stateMachineVertexId] = await dataMapper.query.readStateMachineVertexId({ vertexId: instanceVertexId })

    const [dataStateEdgeId] = await dataMapper.query.readDataStateEdgeId({ vertexId: stateMachineVertexId })

    const [dataVertexId] = await dataMapper.query.findDataVertexId({ edgeId: dataStateEdgeId })

    const { deps } = await dependencyResults({
      rootCtx: { g, dataMapper },
      scope: { componentInstanceVertexId: instanceVertexId, dataVertexId },
    })

    assert.deepEqual(deps, {})

    const [dataRow] = await dataMapper.query.readDataRow({ vertexId: dataVertexId })
    assert.equal(pickFirst(dataRow.name), 'rootData')
  })
})
