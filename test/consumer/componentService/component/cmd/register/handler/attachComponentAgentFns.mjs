import test from 'node:test'
import assert from 'node:assert/strict'

import { agentFn, component as componentBuilder } from '../../../../../../../../lib-component-builder/componentBuilder/index.js'

import { domain, registerHandlerComponent, withGraphContext } from '../helpers.mjs'

function first(value) {
  return Array.isArray(value) ? value[0] : value
}

const hasAgentFnLabel = domain.edge.has_agentFn?.component_agentFn?.constants?.LABEL
  ?? 'domain.edge.has_agentFn.component__agentFn'

test('handler attaches agentFns to registered component graph', async () => {
  await withGraphContext(async ({ diagnostics, dataMapper, g }) => {
    const runCommand = agentFn({ portAddr: 'cmd.run', fn: () => 'ok' })
    const component = componentBuilder('AgentFnGraph')
      .agentFn('runCommand', { portAddr: runCommand })
      .toJSON()

    await registerHandlerComponent({ diagnostics, dataMapper, g }, component)

    const [componentId] = await dataMapper.query.findComponentIdByHash({ hash: component.hash })
    assert.ok(componentId, 'component vertex missing')

    const agentFnIds = await dataMapper.query.listAgentFnIds({ edgeLabel: hasAgentFnLabel, vertexId: componentId })
    assert.equal(agentFnIds.length, 1)

    const [agentFnValues] = await dataMapper.query.readAgentFnValues({ vertexId: agentFnIds[0] })
    assert.equal(first(agentFnValues?.name), 'runCommand')
    assert.equal(first(agentFnValues?.portAddr), 'cmd.run')
    assert.equal(first(agentFnValues?.hash), component.agentFns[0].hash)
    assert.ok(first(agentFnValues?.codeRef), 'agentFn codeRef missing')
  })
})
