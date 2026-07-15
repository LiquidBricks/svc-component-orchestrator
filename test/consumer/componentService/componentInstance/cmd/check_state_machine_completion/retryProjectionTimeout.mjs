import test from 'node:test'
import assert from 'node:assert/strict'
import { diagnostics as createDiagnostics } from '@liquid-bricks/lib-diagnostics'
import { create as createSubject } from '@liquid-bricks/lib-nats-subject/create/basic'

import { Errors } from '../../../../../../errors.js'
import { createComponentServiceRouter } from '../../../../../../router.js'
import { path } from '../../../../../../core/componentInstance/cmd/check_state_machine_completion/index.js'
import {
  PROJECTION_RETRY_DELAYS_MS,
  projectionRetryDelayMs,
  retryProjectionTimeout,
} from '../../../../../../core/componentInstance/cmd/check_state_machine_completion/retryProjectionTimeout.js'

const noop = () => {}

function diagnostics() {
  return createDiagnostics({
    logger: { info: noop, warn: noop, error: noop, debug: noop },
    metrics: { timing: noop, count: noop },
    sample: () => true,
    rateLimit: () => true,
  })
}

test('projection timeout NAK backoff grows and remains capped', () => {
  assert.deepEqual(
    [1, 2, 3, 4, 5, 6, 100].map(projectionRetryDelayMs),
    [1_000, 2_000, 5_000, 10_000, 30_000, 30_000, 30_000],
  )
  assert.equal(PROJECTION_RETRY_DELAYS_MS.at(-1), 30_000)
})

test('completion projection timeout is NAKed without ACK or term', () => {
  const calls = []
  const result = retryProjectionTimeout({
    error: { code: Errors.COMPONENT_INSTANCE_COMPLETION_PROJECTION_TIMEOUT },
    message: {
      info: { deliveryCount: 3 },
      nak: (delayMs) => calls.push(['nak', delayMs]),
      ack: () => calls.push(['ack']),
      term: () => calls.push(['term']),
    },
  })

  assert.deepEqual(calls, [['nak', 5_000]])
  assert.deepEqual(result, {
    projectionRetryScheduled: true,
    projectionRetryDelayMs: 5_000,
    projectionDeliveryCount: 3,
  })
})

test('non-timeout errors are rethrown without NAK', () => {
  const error = new Error('invalid payload')
  let naks = 0
  assert.throws(
    () => retryProjectionTimeout({ error, message: { nak: () => { naks += 1 } } }),
    (caught) => caught === error,
  )
  assert.equal(naks, 0)
})

test('production router handles projection timeout with NAK and never reaches abort ACK', async () => {
  const calls = []
  const subject = createSubject().set(path).forPublish().env('prod').build()
  const message = {
    subject,
    info: { deliveryCount: 2 },
    json: () => ({
      data: {
        instanceId: 'instance-1',
        instanceVertexId: 'instance-v-1',
        stateMachineId: 'machine-1',
        stateEdgeId: 'edge-1',
        stateEdgeStatus: 'provided',
        type: 'data',
      },
    }),
    nak: delayMs => calls.push(['nak', delayMs]),
    ack: () => calls.push(['ack']),
    term: () => calls.push(['term']),
  }
  const router = createComponentServiceRouter({
    diagnostics: diagnostics(),
    natsContext: { publish: async () => assert.fail('completion fact must not publish before projection') },
    dataMapper: {
      query: {
        readStateEdgeStatus: async () => [{ status: 'waiting' }],
      },
    },
    projectionReadinessTimeoutMs: 0,
    projectionReadinessIntervalMs: 0,
  })

  await router.request({ subject, message })

  assert.deepEqual(calls, [['nak', 2_000]])
})
