import test from 'node:test'
import assert from 'node:assert/strict'

import { component as componentBuilder } from '@liquid-bricks/lib-component-builder'

import { domain, registerComponent, withGraphContext } from '../helpers.mjs'

test('handler links imports to existing components', async () => {
  await withGraphContext(async ({ diagnostics, dataMapper, g }) => {
    const component = componentBuilder('ImportingComponent')
      .import('SharedComponent', { hash: 'shared-hash' })
      .toJSON()

    const { id: sharedComponentId } = await dataMapper.vertex.component.create({ hash: 'shared-hash', name: 'SharedComponent' })

    await registerComponent({ diagnostics, dataMapper, g }, component)

    const [componentId] = await g
      .V()
      .has('label', domain.vertex.component.constants.LABEL)
      .has('hash', component.hash)
      .id()

    const importRefIds = await g.V(componentId)
      .out(domain.edge.has_import.component_importRef.constants.LABEL)
      .id()
    assert.equal(importRefIds.length, 1)

    const [importedComponentId] = await g
      .V(importRefIds[0])
      .out(domain.edge.import_of.importRef_component.constants.LABEL)
      .id()
    assert.equal(importedComponentId, sharedComponentId)

    const [importRefValues] = await g.V(importRefIds[0]).valueMap('alias')
    assert.ok(importRefValues, 'import ref missing')
    const aliasValue = Array.isArray(importRefValues.alias) ? importRefValues.alias[0] : importRefValues.alias
    assert.equal(aliasValue, component.imports[0].name)
  })
})

test('handler rejects missing imported components', async () => {
  await withGraphContext(async ({ diagnostics, dataMapper, g }) => {
    const component = componentBuilder('ImportingComponent')
      .import('SharedComponent', { hash: 'missing-hash' })
      .toJSON()

    await assert.rejects(
      registerComponent({ diagnostics, dataMapper, g }, component),
      diagnostics.DiagnosticError,
    )
  })
})

test('handler rejects duplicate import names', async () => {
  await withGraphContext(async ({ diagnostics, dataMapper, g }) => {
    const component = componentBuilder('ImportingComponent')
      .import('SharedComponent', { hash: 'shared-hash-1' })
      .toJSON()
    component.imports = [
      component.imports[0],
      { ...component.imports[0], hash: 'shared-hash-2' },
    ]

    await assert.rejects(
      registerComponent({ diagnostics, dataMapper, g }, component),
      diagnostics.DiagnosticError,
    )
  })
})

test('handler rejects missing import name', async () => {
  await withGraphContext(async ({ diagnostics, dataMapper, g }) => {
    const component = componentBuilder('ImportingComponent')
      .import('SharedComponent', { hash: 'shared-hash' })
      .toJSON()
    component.imports = [{ hash: 'shared-hash' }]

    await assert.rejects(
      registerComponent({ diagnostics, dataMapper, g }, component),
      diagnostics.DiagnosticError,
    )
  })
})

test('handler rejects missing import hash', async () => {
  await withGraphContext(async ({ diagnostics, dataMapper, g }) => {
    const component = componentBuilder('ImportingComponent')
      .import('SharedComponent', { hash: 'shared-hash' })
      .toJSON()
    component.imports = [{ name: 'SharedComponent' }]

    await assert.rejects(
      registerComponent({ diagnostics, dataMapper, g }, component),
      diagnostics.DiagnosticError,
    )
  })
})
