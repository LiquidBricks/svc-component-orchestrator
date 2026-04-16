import test from 'node:test'
import assert from 'node:assert/strict'

import { component as componentBuilder } from '@liquid-bricks/lib-component-builder'

import { componentImports } from '../../../../../../../componentInstance/cmd/create/loadData/componentImports.js'
import {
  withGraphContext,
  registerComponent,
  domain,
} from '../../../../helpers.mjs'

function pickFirst(value) {
  return Array.isArray(value) ? value[0] : value
}

test('componentImports returns imported component metadata', async () => {
  await withGraphContext(async ({ diagnostics, dataMapper, g }) => {
    const imported = componentBuilder('ImportedComponent').toJSON()
    const parent = componentBuilder('ParentComponent')
      .import('aliasA', { hash: imported.hash })
      .toJSON()

    await registerComponent({ diagnostics, dataMapper, g }, imported)
    await registerComponent({ diagnostics, dataMapper, g }, parent)

    const [parentId] = await g
      .V()
      .has('label', domain.vertex.component.constants.LABEL)
      .has('hash', parent.hash)
      .id()

    const { imports } = await componentImports({ rootCtx: { g }, scope: { componentId: parentId } })

    assert.equal(imports.length, 1)
    assert.equal(pickFirst(imports[0].alias), 'aliasA')
    assert.equal(pickFirst(imports[0].componentHash), imported.hash)
  })
})

test('componentImports returns empty array when no imports exist', async () => {
  await withGraphContext(async ({ diagnostics, dataMapper, g }) => {
    const component = componentBuilder('NoImportsComponent').toJSON()

    await registerComponent({ diagnostics, dataMapper, g }, component)

    const [componentId] = await g
      .V()
      .has('label', domain.vertex.component.constants.LABEL)
      .has('hash', component.hash)
      .id()

    const { imports } = await componentImports({ rootCtx: { g }, scope: { componentId } })
    assert.deepEqual(imports, [])
  })
})
