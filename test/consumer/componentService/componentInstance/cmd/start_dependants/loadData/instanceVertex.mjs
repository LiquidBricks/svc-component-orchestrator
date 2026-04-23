import test from 'node:test'
import assert from 'node:assert/strict'

import { component as componentBuilder } from '@liquid-bricks/lib-component-builder'

import { instanceVertex } from '../../../../../../../core/componentInstance/cmd/start_dependants/loadData/instanceVertex.js'
import { componentImports } from '../../../../../../../core/componentInstance/cmd/create/loadData/componentImports.js'
import {
  withGraphContext,
  registerComponent,
  createInstance,
  createHandlerDiagnostics,
  domain,
} from '../../../../helpers.mjs'


test('instanceVertex resolves componentInstance vertex id', async () => {
  await withGraphContext(async ({ diagnostics, dataMapper, g }) => {
    const component = componentBuilder('InstanceVertexComponent').toJSON()

    await registerComponent({ diagnostics, dataMapper, g }, component)

    const [componentId] = await g
      .V()
      .has('label', domain.vertex.component.constants.LABEL)
      .has('hash', component.hash)
      .id()

    const { imports } = await componentImports({ rootCtx: { g }, scope: { componentId } })

    const instanceId = 'instance-vertex'
    await createInstance({ diagnostics, dataMapper, g }, {
      componentHash: component.hash,
      componentId,
      instanceId,
      imports,
    })

    const handlerDiagnostics = createHandlerDiagnostics(diagnostics, { instanceId })
    const { instanceVertexId } = await instanceVertex({
      rootCtx: { g },
      scope: { handlerDiagnostics, instanceId },
    })

    const [row] = await g.V(instanceVertexId).valueMap('instanceId')
    const instanceValue = Array.isArray(row.instanceId) ? row.instanceId[0] : row.instanceId
    assert.equal(instanceValue, instanceId)
  })
})

test('instanceVertex rejects missing instance', async () => {
  await withGraphContext(async ({ diagnostics, g }) => {
    const handlerDiagnostics = createHandlerDiagnostics(diagnostics, { instanceId: 'missing-instance' })

    await assert.rejects(
      instanceVertex({ rootCtx: { g }, scope: { handlerDiagnostics, instanceId: 'missing-instance' } }),
      diagnostics.DiagnosticError,
    )
  })
})
