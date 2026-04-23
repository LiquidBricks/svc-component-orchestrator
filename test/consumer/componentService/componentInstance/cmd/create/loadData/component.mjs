import test from 'node:test'
import assert from 'node:assert/strict'

import { component as componentBuilder } from '@liquid-bricks/lib-component-builder'

import { component } from '../../../../../../../core/componentInstance/cmd/create/loadData/component.js'
import {
  withGraphContext,
  registerComponent,
  createHandlerDiagnostics,
} from '../../../../helpers.mjs'

function pickFirst(value) {
  return Array.isArray(value) ? value[0] : value
}

test('component loadData resolves componentId', async () => {
  await withGraphContext(async ({ diagnostics, dataMapper, g }) => {
    const componentSpec = componentBuilder('ComponentLoad').toJSON()

    await registerComponent({ diagnostics, dataMapper, g }, componentSpec)

    const handlerDiagnostics = createHandlerDiagnostics(diagnostics, { componentHash: componentSpec.hash })
    const { componentId } = await component({
      rootCtx: { g },
      scope: { handlerDiagnostics, componentHash: componentSpec.hash },
    })

    const [row] = await g.V(componentId).valueMap('hash')
    assert.equal(pickFirst(row.hash), componentSpec.hash)
  })
})

test('component loadData rejects unknown componentHash', async () => {
  await withGraphContext(async ({ diagnostics, g }) => {
    const handlerDiagnostics = createHandlerDiagnostics(diagnostics, { componentHash: 'missing-hash' })

    await assert.rejects(
      component({ rootCtx: { g }, scope: { handlerDiagnostics, componentHash: 'missing-hash' } }),
      diagnostics.DiagnosticError,
    )
  })
})
