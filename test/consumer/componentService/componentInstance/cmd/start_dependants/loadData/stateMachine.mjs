import test from 'node:test'
import assert from 'node:assert/strict'

import { component as componentBuilder } from '@liquid-bricks/lib-component-builder'

import { stateMachine } from '../../../../../../../core/componentInstance/cmd/start_dependants/loadData/stateMachine.js'
import { componentImports } from '../../../../../../../core/componentInstance/cmd/create/loadData/componentImports.js'
import {
  withGraphContext,
  registerComponent,
  createInstance,
  createHandlerDiagnostics,
  domain,
} from '../../../../helpers.mjs'

function pickFirst(value) {
  return Array.isArray(value) ? value[0] : value
}

test('stateMachine resolves stateMachineId for instance', async () => {
  await withGraphContext(async ({ diagnostics, dataMapper, g }) => {
    const component = componentBuilder('StateMachineComponent').toJSON()

    await registerComponent({ diagnostics, dataMapper, g }, component)

    const [componentId] = await g
      .V()
      .has('label', domain.vertex.component.constants.LABEL)
      .has('hash', component.hash)
      .id()

    const { imports } = await componentImports({ rootCtx: { g }, scope: { componentId } })

    const instanceId = 'instance-state-machine'
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

    const handlerDiagnostics = createHandlerDiagnostics(diagnostics, { instanceId })
    const { stateMachineId } = await stateMachine({
      rootCtx: { g },
      scope: { handlerDiagnostics, instanceVertexId, instanceId },
    })

    const [row] = await g.V(stateMachineId).valueMap('state')
    assert.equal(pickFirst(row.state), domain.vertex.stateMachine.constants.STATES.CREATED)
  })
})

test('stateMachine rejects missing stateMachine', async () => {
  await withGraphContext(async ({ diagnostics, g }) => {
    const handlerDiagnostics = createHandlerDiagnostics(diagnostics, { instanceId: 'missing-instance' })

    await assert.rejects(
      stateMachine({ rootCtx: { g }, scope: { handlerDiagnostics, instanceVertexId: 'missing-vertex', instanceId: 'missing-instance' } }),
      diagnostics.DiagnosticError,
    )
  })
})
