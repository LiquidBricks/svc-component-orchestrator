import test from 'node:test'
import assert from 'node:assert/strict'

import { diagnostics as makeDiagnostics } from '@liquid-bricks/lib-diagnostics'

import { validatePayload } from '../../../../../../core/component/evt/registered/validatePayload.js'

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

test('validatePayload accepts hash', () => {
  const diagnostics = makeDiagnosticsInstance()
  const handlerDiagnostics = createHandlerDiagnostics(diagnostics, { hash: 'hash-ok' })

  assert.doesNotThrow(() =>
    validatePayload({ scope: { handlerDiagnostics, hash: 'hash-ok' } })
  )
})

test('validatePayload rejects missing hash', () => {
  const diagnostics = makeDiagnosticsInstance()
  const handlerDiagnostics = createHandlerDiagnostics(diagnostics, { hash: '' })

  assert.throws(
    () => validatePayload({ scope: { handlerDiagnostics, hash: '' } }),
    diagnostics.DiagnosticError,
  )
})
