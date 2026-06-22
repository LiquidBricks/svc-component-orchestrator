import test from 'node:test'
import assert from 'node:assert/strict'

import { component as componentBuilder } from '@liquid-bricks/lib-component-builder'

import { providedStateEdge } from '../../../../../../../core/componentInstance/cmd/start_dependants/loadData/providedStateEdge.js'
import { componentImports } from '../../../../../../../core/componentInstance/cmd/create/loadData/componentImports.js'
import { STATE_EDGE_LABEL_BY_TYPE } from '../../../../../../../core/componentInstance/cmd/start_dependants/constants.js'
import {
  withGraphContext,
  registerComponent,
  createInstance,
  createHandlerDiagnostics,
  domain,
} from '../../../../helpers.mjs'


test('providedStateEdge resolves provided node id', async () => {
  await withGraphContext(async ({ diagnostics, dataMapper, g }) => {
    const component = componentBuilder('ProvidedEdgeComponent')
      .data('inputData', { deps: () => { } })
      .toJSON()

    await registerComponent({ diagnostics, dataMapper, g }, component)

    const [componentId] = await dataMapper.query.findComponentIdByHash({ hash: component.hash })

    const { imports } = await componentImports({ rootCtx: { g, dataMapper }, scope: { componentId } })

    const instanceId = 'instance-provided-edge'
    await createInstance({ diagnostics, dataMapper, g }, {
      componentHash: component.hash,
      componentId,
      instanceId,
      imports,
    })

    const [instanceVertexId] = await dataMapper.query.findInstanceVertexId({ instanceId })

    const [stateMachineId] = await dataMapper.query.readStateMachineId({ vertexId: instanceVertexId })

    const stateEdgeLabel = STATE_EDGE_LABEL_BY_TYPE.data
    const [stateEdgeId] = await dataMapper.query.listStateEdgeIds({ edgeLabel: stateEdgeLabel, vertexId: stateMachineId })

    const handlerDiagnostics = createHandlerDiagnostics(diagnostics, { instanceId, stateEdgeId, type: 'data' })
    const { providedNodeId } = await providedStateEdge({
      rootCtx: { g, dataMapper },
      scope: { handlerDiagnostics, stateMachineId, stateEdgeLabel, stateEdgeId, instanceId, type: 'data' },
    })

    const [row] = await dataMapper.query.readNodeName({ vertexId: providedNodeId })
    const value = Array.isArray(row.name) ? row.name[0] : row.name
    assert.equal(value, 'inputData')
  })
})

test('providedStateEdge rejects missing stateEdge', async () => {
  await withGraphContext(async ({ diagnostics, g, dataMapper }) => {
    const handlerDiagnostics = createHandlerDiagnostics(diagnostics, { instanceId: 'instance', stateEdgeId: 'missing', type: 'data' })

    await assert.rejects(
      providedStateEdge({
        rootCtx: { g, dataMapper },
        scope: {
          handlerDiagnostics,
          stateMachineId: 'missing-state-machine',
          stateEdgeLabel: STATE_EDGE_LABEL_BY_TYPE.data,
          stateEdgeId: 'missing',
          instanceId: 'instance',
          type: 'data',
        },
      }),
      diagnostics.DiagnosticError,
    )
  })
})
