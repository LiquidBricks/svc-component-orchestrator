import test from 'node:test'
import assert from 'node:assert/strict'

import { agentFn, component as componentBuilder } from '../../../../../../../../lib-component-builder/componentBuilder/index.js'

import { domain, registerHandlerComponent, withGraphContext } from '../helpers.mjs'

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

    await registerHandlerComponent({ diagnostics, dataMapper, g }, component)

    const [componentId] = await dataMapper.query.findComponentIdByHash({ hash: component.hash })

    const gateRefIds = await dataMapper.query.listGateRefIds({ vertexId: componentId })
    assert.equal(gateRefIds.length, 1)

    const [gatedComponentId] = await dataMapper.query.findGatedComponentIdForGateRef({ vertexId: gateRefIds[0] })
    assert.equal(gatedComponentId, sharedComponentId)

    const [gateValues] = await dataMapper.query.readGateValues({ vertexId: gateRefIds[0] })
    const aliasValue = Array.isArray(gateValues?.alias) ? gateValues.alias[0] : gateValues?.alias
    const fncValue = Array.isArray(gateValues?.fnc) ? gateValues.fnc[0] : gateValues?.fnc
    assert.equal(aliasValue, component.gates[0].name)
    assert.equal(fncValue, component.gates[0].fnc)

    const waitForTaskIds = await dataMapper.query.listWaitForTaskIds({ vertexId: gateRefIds[0] })
    const waitForDataIds = await dataMapper.query.listWaitForDataIds({ vertexId: gateRefIds[0] })
    const depTaskIds = await dataMapper.query.listDepTaskIds({ vertexId: gateRefIds[0] })
    assert.equal(waitForDataIds.length, 1)
    assert.equal(waitForTaskIds.length, 0)
    assert.equal(depTaskIds.length, 1)
  })
})

test('handler accepts agentFn gate deps without creating graph dependency edges', async () => {
  await withGraphContext(async ({ diagnostics, dataMapper, g }) => {
    const runCommand = agentFn({ portAddr: 'cmd.run', fn: () => 'ok' })
    const component = componentBuilder('AgentFnGateDeps')
      .agentFn('runCommand', { portAddr: runCommand })
      .gate('setup', {
        hash: 'shared-hash',
        fnc: () => true,
        deps: ({ agentFn }) => agentFn.runCommand,
      })
      .toJSON()

    await dataMapper.vertex.component.create({ hash: 'shared-hash', name: 'SharedComponent' })

    await registerHandlerComponent({ diagnostics, dataMapper, g }, component)

    const [componentId] = await dataMapper.query.findComponentIdByHash({ hash: component.hash })
    const [gateRefId] = await dataMapper.query.listGateRefIds({ vertexId: componentId })

    assert.ok(gateRefId, 'gateRef missing')
    assert.deepEqual(await dataMapper.query.findHasDependencyGateRefTask({ vertexId: gateRefId }), [])
    assert.deepEqual(await dataMapper.query.findHasDependencyGateRefData({ vertexId: gateRefId }), [])
  })
})

test('handler rejects missing gated components', async () => {
  await withGraphContext(async ({ diagnostics, dataMapper, g }) => {
    const component = componentBuilder('GatingComponent')
      .gate('setup', { hash: 'missing-hash', fnc: () => true })
      .toJSON()

    await assert.rejects(
      registerHandlerComponent({ diagnostics, dataMapper, g }, component),
      diagnostics.DiagnosticError,
    )
  })
})
