import test from 'node:test'
import assert from 'node:assert/strict'

import { path as registerPath } from '../../../../../core/componentAgent/cmd/register/index.js'
import { createRouteMessage, invokeRoute } from '../../../../util/invokeRoute.js'
import { domain, withGraphContext } from '../../helpers.mjs'

test('componentAgent register route creates componentAgent vertex', async () => {
  await withGraphContext(async ({ diagnostics, dataMapper, g }) => {
    const agentID = 'agent-register-route'
    const message = createRouteMessage({
      data: { agentID },
    })

    const { scope } = await invokeRoute(
      { diagnostics, dataMapper, g },
      { path: registerPath, data: { agentID }, message },
    )

    assert.equal(message.acked, true)
    assert.equal(scope.componentAgentAlreadyRegistered, false)

    const [componentAgentVID] = await dataMapper.query.findComponentAgentVertexId({ agentID })
    assert.equal(componentAgentVID, scope.componentAgentVID)
  })
})
