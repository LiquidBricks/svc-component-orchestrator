import test from 'node:test'
import assert from 'node:assert/strict'

import { create as createBasicSubject } from '@liquid-bricks/lib-nats-subject/create/basic'

import { publishExecutionRequest } from '../../../../../../task/cmd/start/publishExecutionRequest.js'

test('publishExecutionRequest emits task execution request', async () => {
  const published = []
  const natsContext = {
    publish: async (subject, payload) => published.push({ subject, payload: JSON.parse(payload) }),
  }

  await publishExecutionRequest({
    rootCtx: { natsContext },
    scope: {
      instanceId: 'instance-task',
      componentHash: 'hash-task',
      name: 'taskA',
      deps: { data: { input: 1 } },
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
    instanceId: 'instance-task',
    deps: { data: { input: 1 } },
    componentHash: 'hash-task',
    name: 'taskA',
    type: 'task',
  })
})
