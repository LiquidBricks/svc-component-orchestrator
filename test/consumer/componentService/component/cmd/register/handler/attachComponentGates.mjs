import test from 'node:test'
import assert from 'node:assert/strict'

import { component as componentBuilder } from '@liquid-bricks/lib-component-builder'

import { domain, registerComponent, withGraphContext } from '../helpers.mjs'

test('handler links gates to existing components and records waitFor/deps', async () => {
  await withGraphContext(async ({ diagnostics, dataMapper, g }) => {
    const component = componentBuilder('GatingComponent')
      .task('check', {})
      .data('ready', { deps: () => { } })
      .gate('setup', {
        hash: 'shared-hash',
        fnc: () => true,
        waitFor: ({ data }) => data.ready,
        deps: ({ task }) => task.check,
      })
      .toJSON()

    const { id: sharedComponentId } = await dataMapper.vertex.component.create({ hash: 'shared-hash', name: 'SharedComponent' })

    await registerComponent({ diagnostics, dataMapper, g }, component)

    const [componentId] = await g
      .V()
      .has('label', domain.vertex.component.constants.LABEL)
      .has('hash', component.hash)
      .id()

    const gateRefIds = await g.V(componentId)
      .out(domain.edge.has_gate.component_gateRef.constants.LABEL)
      .id()
    assert.equal(gateRefIds.length, 1)

    const [gatedComponentId] = await g
      .V(gateRefIds[0])
      .out(domain.edge.gate_of.gateRef_component.constants.LABEL)
      .id()
    assert.equal(gatedComponentId, sharedComponentId)

    const [gateValues] = await g.V(gateRefIds[0]).valueMap('alias', 'fnc')
    const aliasValue = Array.isArray(gateValues?.alias) ? gateValues.alias[0] : gateValues?.alias
    const fncValue = Array.isArray(gateValues?.fnc) ? gateValues.fnc[0] : gateValues?.fnc
    assert.equal(aliasValue, component.gates[0].name)
    assert.equal(fncValue, component.gates[0].fnc)

    const waitForTaskIds = await g.V(gateRefIds[0]).out(domain.edge.wait_for.gateRef_task.constants.LABEL).id()
    const waitForDataIds = await g.V(gateRefIds[0]).out(domain.edge.wait_for.gateRef_data.constants.LABEL).id()
    const depTaskIds = await g.V(gateRefIds[0]).out(domain.edge.has_dependency.gateRef_task.constants.LABEL).id()
    assert.equal(waitForDataIds.length, 1)
    assert.equal(waitForTaskIds.length, 0)
    assert.equal(depTaskIds.length, 1)
  })
})

test('handler rejects missing gated components', async () => {
  await withGraphContext(async ({ diagnostics, dataMapper, g }) => {
    const component = componentBuilder('GatingComponent')
      .gate('setup', { hash: 'missing-hash', fnc: () => true })
      .toJSON()

    await assert.rejects(
      registerComponent({ diagnostics, dataMapper, g }, component),
      diagnostics.DiagnosticError,
    )
  })
})
