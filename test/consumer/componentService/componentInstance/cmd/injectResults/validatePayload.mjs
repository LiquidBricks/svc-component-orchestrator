import test from 'node:test'
import assert from 'node:assert/strict'
import { diagnostics as createDiagnostics } from '@liquid-bricks/lib-diagnostics'

import { validatePayload } from '../../../../../../core/componentInstance/cmd/injectResults/validatePayload.js'

const noop = () => {}

function validation(scope) {
  const diagnostics = createDiagnostics({
    logger: { info: noop, warn: noop, error: noop, debug: noop },
    metrics: { timing: noop, count: noop },
    sample: () => true,
    rateLimit: () => true,
  })
  const handlerDiagnostics = diagnostics.child({ router: { stage: 'unit-test' }, scope })

  return {
    diagnostics,
    run: () => validatePayload({ scope: { ...scope, handlerDiagnostics } }),
  }
}

const valid = Object.freeze({
  instanceId: 'source-instance',
  instanceVertexId: 'source-instance-vertex',
  stateMachineId: 'source-state-machine',
  stateEdgeId: 'source-state-edge',
  type: 'task',
  result: { value: 42 },
  updatedAt: '2026-07-20T12:00:00.000Z',
})

test('accepts a snapshot-correlated injection command', () => {
  assert.doesNotThrow(validation(valid).run)
})

for (const field of ['instanceId', 'instanceVertexId', 'stateMachineId', 'stateEdgeId', 'updatedAt']) {
  test(`rejects an injection command without ${field}`, () => {
    const candidate = { ...valid, [field]: '' }
    const check = validation(candidate)
    assert.throws(check.run, check.diagnostics.DiagnosticError)
  })
}

test('rejects an injection command without a native result', () => {
  const candidate = { ...valid }
  Reflect.deleteProperty(candidate, 'result')
  const check = validation(candidate)
  assert.throws(check.run, check.diagnostics.DiagnosticError)
})

test('rejects an unsupported injection source type', () => {
  const check = validation({ ...valid, type: 'gate' })
  assert.throws(check.run, check.diagnostics.DiagnosticError)
})

test('rejects a non-canonical injection timestamp', () => {
  for (const updatedAt of ['not-a-date', '2026-07-20']) {
    const check = validation({ ...valid, updatedAt })
    assert.throws(check.run, check.diagnostics.DiagnosticError)
  }
})
