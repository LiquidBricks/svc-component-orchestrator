import test from 'node:test'
import assert from 'node:assert/strict'

import { component as componentBuilder } from '@liquid-bricks/lib-component-builder'

import { handler } from '../../../../../../core/componentInstance/evt/state_machine_completed/handler.js'
import { componentImports } from '../../../../../../core/componentInstance/cmd/create/loadData/componentImports.js'
import {
  withGraphContext,
  registerComponent,
  createInstance,
  createHandlerDiagnostics,
  domain,
} from '../../../helpers.mjs'

function pickFirst(value) {
  return Array.isArray(value) ? value[0] : value
}

test('handler marks stateMachine complete', async () => {
  await withGraphContext(async ({ diagnostics, dataMapper, g }) => {
    const component = componentBuilder('StateCompleteComponent').toJSON()

    await registerComponent({ diagnostics, dataMapper, g }, component)

    const [componentId] = await dataMapper.query.findComponentIdByHash({ hash: component.hash })

    const { imports } = await componentImports({ rootCtx: { g, dataMapper }, scope: { componentId } })

    const instanceId = 'instance-complete'
    await createInstance({ diagnostics, dataMapper, g }, {
      componentHash: component.hash,
      componentId,
      instanceId,
      imports,
    })

    const [instanceVertexId] = await dataMapper.query.findInstanceVertexId({ instanceId })

    const [stateMachineId] = await dataMapper.query.readStateMachineId({ vertexId: instanceVertexId })

    const handlerDiagnostics = createHandlerDiagnostics(diagnostics, { instanceId, stateMachineId })

    await handler({
      rootCtx: { g, dataMapper },
      scope: { handlerDiagnostics, instanceId, stateMachineId },
    })

    const [stateRow] = await dataMapper.query.readStateMachineState({ vertexId: stateMachineId })
    assert.equal(
      pickFirst(stateRow.state),
      domain.vertex.stateMachine.constants.STATES.COMPLETE,
    )
  })
})
