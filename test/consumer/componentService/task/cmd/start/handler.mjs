import test from 'node:test'
import assert from 'node:assert/strict'

import { handler } from '../../../../../../core/task/cmd/start/handler.js'
import { dataMapper as createDataMapper } from '@liquid-bricks/spec-domain/domain'

function makeGraphSpy() {
  const calls = []
  const g = {
    E(id) {
      return {
        property(key, value) {
          calls.push({ id, key, value })
          return this
        },
      }
    },
  }
  return { calls, g, dataMapper: createDataMapper({ g, diagnostics: {} }) }
}

test('handler marks task state running and updates timestamp', async () => {
  const { g, dataMapper, calls } = makeGraphSpy()
  await handler({
    rootCtx: { g, dataMapper },
    scope: { handlerDiagnostics: {}, stateId: 'state-task-1' },
  })

  assert.equal(calls.length, 2)
  assert.equal(calls[0].id, 'state-task-1')
  assert.deepEqual(
    calls.map(({ key, value }) => ({ key, value })),
    [
      { key: 'status', value: 'running' },
      { key: 'updatedAt', value: calls[1].value },
    ]
  )
  assert.ok(!Number.isNaN(Date.parse(calls[1].value)))
})
