import test from 'node:test'
import assert from 'node:assert/strict'

import { diagnostics as makeDiagnostics } from '@liquid-bricks/lib-diagnostics'

import { validatePayload } from '../../../../../../core/componentInstance/cmd/start_dependants/validatePayload.js'

const noop = () => {}
function makeDiagnosticsInstance() {
  return makeDiagnostics({
    logger: { info: noop, warn: noop, error: noop, debug: noop },
    metrics: { timing: noop, count: noop },
    sample: () => true,
    rateLimit: () => true,
  })
}

function createHandlerDiagnostics(diagnostics, scope = {}, message) {
  return diagnostics.child
    ? diagnostics.child({ router: { stage: 'unit-test' }, scope, message })
    : diagnostics
}

test('validatePayload returns stateEdgeLabel for valid payload', () => {
  const diagnostics = makeDiagnosticsInstance()
  const handlerDiagnostics = createHandlerDiagnostics(diagnostics, { instanceId: 'i-1', stateEdgeId: 's-1', type: 'data' })

  const result = validatePayload({
    scope: { handlerDiagnostics, instanceId: 'i-1', stateEdgeId: 's-1', type: 'data' },
  })

  assert.ok(result.stateEdgeLabel)
})

test('validatePayload rejects missing instanceId', () => {
  const diagnostics = makeDiagnosticsInstance()
  const handlerDiagnostics = createHandlerDiagnostics(diagnostics, { stateEdgeId: 's-1', type: 'data' })

  assert.throws(
    () => validatePayload({ scope: { handlerDiagnostics, instanceId: '', stateEdgeId: 's-1', type: 'data' } }),
    diagnostics.DiagnosticError,
  )
})

test('validatePayload rejects missing stateEdgeId', () => {
  const diagnostics = makeDiagnosticsInstance()
  const handlerDiagnostics = createHandlerDiagnostics(diagnostics, { instanceId: 'i-1', type: 'data' })

  assert.throws(
    () => validatePayload({ scope: { handlerDiagnostics, instanceId: 'i-1', stateEdgeId: '', type: 'data' } }),
    diagnostics.DiagnosticError,
  )
})

test('validatePayload rejects invalid type', () => {
  const diagnostics = makeDiagnosticsInstance()
  const handlerDiagnostics = createHandlerDiagnostics(diagnostics, { instanceId: 'i-1', stateEdgeId: 's-1', type: 'bad' })

  assert.throws(
    () => validatePayload({ scope: { handlerDiagnostics, instanceId: 'i-1', stateEdgeId: 's-1', type: 'bad' } }),
    diagnostics.DiagnosticError,
  )
})
