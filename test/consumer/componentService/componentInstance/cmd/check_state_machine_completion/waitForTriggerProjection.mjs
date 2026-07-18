import test from 'node:test'
import assert from 'node:assert/strict'

import { diagnostics as makeDiagnostics } from '@liquid-bricks/lib-diagnostics'

import { waitForTriggerProjection } from '../../../../../../core/componentInstance/cmd/check_state_machine_completion/waitForTriggerProjection.js'
import { validatePayload } from '../../../../../../core/componentInstance/cmd/check_state_machine_completion/validatePayload.js'
import { spec } from '../../../../../../core/componentInstance/cmd/check_state_machine_completion/index.js'
import { Errors } from '../../../../../../errors.js'

const noop = () => {}

function makeHandlerDiagnostics(scope) {
  const diagnostics = makeDiagnostics({
    logger: { info: noop, warn: noop, error: noop, debug: noop },
    metrics: { timing: noop, count: noop },
    sample: () => true,
    rateLimit: () => true,
  })
  const handlerDiagnostics = diagnostics.child
    ? diagnostics.child({ router: { stage: 'unit-test' }, scope })
    : diagnostics

  return { diagnostics, handlerDiagnostics }
}

function values(key, value) {
  return [{ [key]: [value] }]
}

test('runs projection readiness after payload validation and before the handler', () => {
  assert.equal(spec.pre[0], validatePayload)
  assert.equal(spec.pre[1], waitForTriggerProjection)
})

test('returns immediately when the triggering state status is already projected', async () => {
  const scope = {
    type: 'task',
    stateEdgeId: 'state-edge-1',
    stateEdgeStatus: 'provided',
  }
  const { handlerDiagnostics } = makeHandlerDiagnostics(scope)
  let reads = 0

  await waitForTriggerProjection({
    scope: { ...scope, handlerDiagnostics },
    rootCtx: {
      projectionReadinessTimeoutMs: 0,
      projectionReadinessIntervalMs: 0,
      dataMapper: {
        query: {
          readStateEdgeStatus: async ({ edgeId }) => {
            reads += 1
            assert.equal(edgeId, 'state-edge-1')
            return values('status', 'provided')
          },
        },
      },
    },
  })

  assert.equal(reads, 1)
})

test('returns immediately when the triggering gate result is already projected', async () => {
  const scope = {
    type: 'gate',
    stateEdgeId: 'gate-state-edge-1',
    gateInstanceRefId: 'gate-ref-1',
    result: false,
    resultValue: 'false',
  }
  const { handlerDiagnostics } = makeHandlerDiagnostics(scope)
  let reads = 0

  await waitForTriggerProjection({
    scope: { ...scope, handlerDiagnostics },
    rootCtx: {
      projectionReadinessTimeoutMs: 0,
      projectionReadinessIntervalMs: 0,
      dataMapper: {
        query: {
          readResultValues: async ({ edgeId }) => {
            reads += 1
            assert.equal(edgeId, 'gate-state-edge-1')
            return values('result', 'false')
          },
        },
      },
    },
  })

  assert.equal(reads, 1)
})

test('raises a specific DiagnosticError when the projection does not become ready', async () => {
  const scope = {
    type: 'data',
    stateEdgeId: 'state-edge-timeout',
    stateEdgeStatus: 'provided',
  }
  const { diagnostics, handlerDiagnostics } = makeHandlerDiagnostics(scope)
  let reads = 0

  await assert.rejects(
    waitForTriggerProjection({
      scope: { ...scope, handlerDiagnostics },
      rootCtx: {
        projectionReadinessTimeoutMs: 0,
        projectionReadinessIntervalMs: 0,
        dataMapper: {
          query: {
            readStateEdgeStatus: async () => {
              reads += 1
              return values('status', 'pending')
            },
          },
        },
      },
    }),
    error => {
      assert.ok(error instanceof diagnostics.DiagnosticError)
      assert.equal(error.code, Errors.COMPONENT_INSTANCE_COMPLETION_PROJECTION_TIMEOUT)
      assert.equal(error.type, 'Precondition')
      assert.equal(error.meta.stateEdgeId, 'state-edge-timeout')
      assert.equal(error.meta.expected, 'provided')
      assert.equal(error.meta.observed, 'pending')
      assert.equal(error.meta.timeoutMs, 0)
      return true
    },
  )

  assert.equal(reads, 1)
})
