import test from 'node:test'
import assert from 'node:assert/strict'

import { diagnostics as makeDiagnostics } from '@liquid-bricks/lib-diagnostics'

import { validatePayload } from '../../../../../../componentInstance/evt/state_machine_completed/validatePayload.js'

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

test('validatePayload accepts instanceId and stateMachineId', () => {
  const diagnostics = makeDiagnosticsInstance()
  const handlerDiagnostics = createHandlerDiagnostics(diagnostics, { instanceId: 'i-1', stateMachineId: 's-1' })

  assert.doesNotThrow(() =>
    validatePayload({ scope: { handlerDiagnostics, instanceId: 'i-1', stateMachineId: 's-1' } })
  )
})

test('validatePayload rejects missing instanceId', () => {
  const diagnostics = makeDiagnosticsInstance()
  const handlerDiagnostics = createHandlerDiagnostics(diagnostics, { stateMachineId: 's-1' })

  assert.throws(
    () => validatePayload({ scope: { handlerDiagnostics, instanceId: '', stateMachineId: 's-1' } }),
    diagnostics.DiagnosticError,
  )
})

test('validatePayload rejects missing stateMachineId', () => {
  const diagnostics = makeDiagnosticsInstance()
  const handlerDiagnostics = createHandlerDiagnostics(diagnostics, { instanceId: 'i-1' })

  assert.throws(
    () => validatePayload({ scope: { handlerDiagnostics, instanceId: 'i-1', stateMachineId: '' } }),
    diagnostics.DiagnosticError,
  )
})
