import test from 'node:test'
import assert from 'node:assert/strict'

import { component as componentBuilder } from '@liquid-bricks/lib-component-builder'

import { domain, registerHandlerComponent, withGraphContext } from '../helpers.mjs'

test('handler links imports to existing components', async () => {
  await withGraphContext(async ({ diagnostics, dataMapper, g }) => {
    const component = componentBuilder('ImportingComponent')
      .import('SharedComponent', { hash: 'shared-hash' })
      .toJSON()

    const { id: sharedComponentId } = await dataMapper.vertex.component.create({ hash: 'shared-hash', name: 'SharedComponent' })

    await registerHandlerComponent({ diagnostics, dataMapper, g }, component)

    const [componentId] = await dataMapper.query.findComponentIdByHash({ hash: component.hash })

    const importRefIds = await dataMapper.query.listImportRefIds({ vertexId: componentId })
    assert.equal(importRefIds.length, 1)

    const [importedComponentId] = await dataMapper.query.findImportedComponentIdForImportRef({ vertexId: importRefIds[0] })
    assert.equal(importedComponentId, sharedComponentId)

    const [importRefValues] = await dataMapper.query.readImportRefValues({ vertexId: importRefIds[0] })
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
      registerHandlerComponent({ diagnostics, dataMapper, g }, component),
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
      registerHandlerComponent({ diagnostics, dataMapper, g }, component),
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
      registerHandlerComponent({ diagnostics, dataMapper, g }, component),
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
      registerHandlerComponent({ diagnostics, dataMapper, g }, component),
      diagnostics.DiagnosticError,
    )
  })
})
