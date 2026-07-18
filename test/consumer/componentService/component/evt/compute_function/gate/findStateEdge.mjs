import test from 'node:test'
import assert from 'node:assert/strict'

import { diagnostics as makeDiagnostics } from '@liquid-bricks/lib-diagnostics'

import { findStateEdge } from '../../../../../../../core/component/evt/compute_function/gate/findStateEdge.js'

const noop = () => {}

function makeHandlerDiagnostics() {
  const diagnostics = makeDiagnostics({
    logger: { info: noop, warn: noop, error: noop, debug: noop },
    metrics: { timing: noop, count: noop },
    sample: () => true,
    rateLimit: () => true,
  })
  return {
    diagnostics,
    handlerDiagnostics: diagnostics.child({ router: { stage: 'unit-test' } }),
  }
}

function scope(handlerDiagnostics) {
  return {
    handlerDiagnostics,
    instanceId: 'instance-1',
    instanceVertexId: 'instance-vertex-1',
    stateMachineId: 'state-machine-1',
    name: 'setup',
  }
}

test('findStateEdge resolves the gate reference and its owning state edge', async () => {
  const { handlerDiagnostics } = makeHandlerDiagnostics()
  const query = {
    findGateInstanceRefIdByAlias: async payload => {
      assert.deepEqual(payload, { vertexId: 'instance-vertex-1', alias: 'setup' })
      return ['gate-ref-1']
    },
    findGateStateEdgeIdForTargetNode: async payload => {
      assert.deepEqual(payload, { vertexId: 'state-machine-1', id: 'gate-ref-1' })
      return ['gate-state-edge-1']
    },
  }

  assert.deepEqual(
    await findStateEdge({
      scope: scope(handlerDiagnostics),
      rootCtx: { dataMapper: { query } },
    }),
    { gateInstanceRefId: 'gate-ref-1', stateEdgeId: 'gate-state-edge-1' },
  )
})

test('findStateEdge rejects a gate alias that is not part of the instance', async () => {
  const { diagnostics, handlerDiagnostics } = makeHandlerDiagnostics()

  await assert.rejects(
    findStateEdge({
      scope: scope(handlerDiagnostics),
      rootCtx: {
        dataMapper: {
          query: { findGateInstanceRefIdByAlias: async () => [] },
        },
      },
    }),
    diagnostics.DiagnosticError,
  )
})

test('findStateEdge rejects a gate reference without state-machine state', async () => {
  const { diagnostics, handlerDiagnostics } = makeHandlerDiagnostics()
  const query = {
    findGateInstanceRefIdByAlias: async () => ['gate-ref-1'],
    findGateStateEdgeIdForTargetNode: async () => [],
  }

  await assert.rejects(
    findStateEdge({
      scope: scope(handlerDiagnostics),
      rootCtx: { dataMapper: { query } },
    }),
    diagnostics.DiagnosticError,
  )
})
