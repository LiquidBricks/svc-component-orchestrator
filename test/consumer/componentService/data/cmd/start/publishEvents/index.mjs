import test from 'node:test'
import assert from 'node:assert/strict'

import { create as createBasicSubject } from '@liquid-bricks/lib-nats-subject/create/basic'

import { publishEvents } from '../../../../../../../data/cmd/start/publishEvents/index.js'

test('publishEvents emits execution request for data', async () => {
  const published = []
  const natsContext = {
    publish: async (subject, payload) => published.push({ subject, payload: JSON.parse(payload) }),
  }

  await publishEvents({
    rootCtx: { natsContext },
    scope: {
      instanceId: 'instance-data',
      componentHash: 'hash-data',
      name: 'inputData',
      deps: { task: { done: true } },
    },
  })

  const subject = createBasicSubject()
    .env('prod')
    .ns('component-service')
    .entity('component')
    .channel('exec')
    .action('compute_result')
    .version('v1')
    .build()

  assert.equal(published.length, 1)
  assert.equal(published[0].subject, subject)
  assert.deepEqual(published[0].payload.data, {
    instanceId: 'instance-data',
    deps: { task: { done: true } },
    componentHash: 'hash-data',
    name: 'inputData',
    type: 'data',
  })
})
