import test from 'node:test'
import assert from 'node:assert/strict'

import { handler } from '../../../../../../data/cmd/start/handler.js'

function makeGraphSpy() {
  const calls = []
  return {
    calls,
    g: {
      V(id) {
        return {
          property(key, value) {
            calls.push({ id, key, value })
            return this
          },
        }
      },
    },
  }
}

test('handler marks data state running and updates timestamp', async () => {
  const { g, calls } = makeGraphSpy()
  await handler({
    rootCtx: { g },
    scope: { handlerDiagnostics: {}, stateId: 'state-1' },
  })

  assert.equal(calls.length, 2)
  assert.deepEqual(
    calls.map(({ key, value }) => ({ key, value })),
    [
      { key: 'status', value: 'running' },
      { key: 'updatedAt', value: calls[1].value },
    ]
  )
  assert.ok(!Number.isNaN(Date.parse(calls[1].value)))
})
