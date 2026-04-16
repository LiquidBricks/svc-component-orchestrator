import test from 'node:test'
import assert from 'node:assert/strict'

import { diagnostics as makeDiagnostics } from '@liquid-bricks/lib-diagnostics'
import {
  ackMessage,
  decodeData,
  stopDiagnosticsTimer,
} from '../../../middleware.js'

const noop = () => { }
const baseDiagnostics = makeDiagnostics({
  logger: { info: noop, warn: noop, error: noop, debug: noop },
  metrics: { timing: noop, count: noop },
  sample: () => true,
  rateLimit: () => true,
})

function makeMessage({ data, subject = 'unit.test' } = {}) {
  let acked = false
  return {
    subject,
    ack() { acked = true },
    json() { return data ? { data } : {} },
    get acked() { return acked },
  }
}

test('decodeData: string selector wraps full payload', () => {
  const message = makeMessage({ data: { foo: 'bar', num: 42 } })
  const decode = decodeData('component')

  const scoped = decode({ message, rootCtx: { diagnostics: baseDiagnostics } })

  assert.deepEqual(scoped, { component: { foo: 'bar', num: 42 } })
})

test('decodeData: array selector picks provided keys', () => {
  const message = makeMessage({ data: { foo: 'bar', keep: true } })
  const decode = decodeData(['keep', 'missing'])

  const scoped = decode({ message, rootCtx: { diagnostics: baseDiagnostics } })

  assert.deepEqual(scoped, { keep: true })
})

test('decodeData: missing payload triggers DiagnosticError', () => {
  const message = makeMessage({})
  const decode = decodeData('component')

  assert.throws(
    () => decode({ message, rootCtx: { diagnostics: baseDiagnostics } }),
    baseDiagnostics.DiagnosticError,
  )
})

test('decodeData: empty selector string rejected', () => {
  const message = makeMessage({ data: { foo: 'bar' } })
  const decode = decodeData('')

  assert.throws(
    () => decode({ message, rootCtx: { diagnostics: baseDiagnostics } }),
    baseDiagnostics.DiagnosticError,
  )
})

test('ackMessage: calls ack on message', () => {
  const message = makeMessage({ data: { foo: 'bar' } })

  ackMessage({ message })

  assert.equal(message.acked, true)
})

test('diagnostics timer helpers: stop returns timer output', () => {
  let capturedMeta
  const timer = {
    stop(payload) {
      capturedMeta = payload.meta
      return 'stopped'
    }
  }
  const stop = stopDiagnosticsTimer(() => ({ meta: 'value' }))

  const result = stop({ scope: { timer } })

  assert.equal(result, 'stopped')
  assert.equal(capturedMeta, 'value')
})
