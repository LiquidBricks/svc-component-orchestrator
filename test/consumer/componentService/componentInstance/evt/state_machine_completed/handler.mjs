import test from 'node:test'
import assert from 'node:assert/strict'

import { component as componentBuilder } from '@liquid-bricks/lib-component-builder'

import { handler } from '../../../../../../componentInstance/evt/state_machine_completed/handler.js'
import { componentImports } from '../../../../../../componentInstance/cmd/create/loadData/componentImports.js'
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

    const [componentId] = await g
      .V()
      .has('label', domain.vertex.component.constants.LABEL)
      .has('hash', component.hash)
      .id()

    const { imports } = await componentImports({ rootCtx: { g }, scope: { componentId } })

    const instanceId = 'instance-complete'
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

    const handlerDiagnostics = createHandlerDiagnostics(diagnostics, { instanceId, stateMachineId })

    await handler({
      rootCtx: { g },
      scope: { handlerDiagnostics, instanceId, stateMachineId },
    })

    const [stateRow] = await g.V(stateMachineId).valueMap('state')
    assert.equal(
      pickFirst(stateRow.state),
      domain.vertex.stateMachine.constants.STATES.COMPLETE,
    )
  })
})
