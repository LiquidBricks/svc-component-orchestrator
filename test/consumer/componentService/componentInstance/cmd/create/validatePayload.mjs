import test from 'node:test'
import assert from 'node:assert/strict'

import { diagnostics as makeDiagnostics } from '@liquid-bricks/lib-diagnostics'

import { validatePayload } from '../../../../../../componentInstance/cmd/create/validatePayload.js'

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

test('validatePayload accepts componentHash and instanceId', () => {
  const diagnostics = makeDiagnosticsInstance()
  const handlerDiagnostics = createHandlerDiagnostics(diagnostics, { componentHash: 'hash', instanceId: 'instance' })

  assert.doesNotThrow(() =>
    validatePayload({ scope: { handlerDiagnostics, componentHash: 'hash', instanceId: 'instance' } })
  )
})

test('validatePayload rejects missing componentHash', () => {
  const diagnostics = makeDiagnosticsInstance()
  const handlerDiagnostics = createHandlerDiagnostics(diagnostics, { instanceId: 'instance' })

  assert.throws(
    () => validatePayload({ scope: { handlerDiagnostics, componentHash: '', instanceId: 'instance' } }),
    diagnostics.DiagnosticError,
  )
})

test('validatePayload rejects missing instanceId', () => {
  const diagnostics = makeDiagnosticsInstance()
  const handlerDiagnostics = createHandlerDiagnostics(diagnostics, { componentHash: 'hash' })

  assert.throws(
    () => validatePayload({ scope: { handlerDiagnostics, componentHash: 'hash', instanceId: '' } }),
    diagnostics.DiagnosticError,
  )
})
