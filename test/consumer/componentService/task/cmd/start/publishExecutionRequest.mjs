import test from 'node:test'
import assert from 'node:assert/strict'
import { create as createBasicSubject } from '@liquid-bricks/lib-nats-subject/create/basic'

import { publishExecutionRequest } from '../../../../../../core/domain/edge/has_task_state/started/publishExecutionRequest.js'
import { spec as taskStartedSpec } from '../../../../../../core/domain/edge/has_task_state/started/index.js'

import { events as natsEvents } from '@liquid-bricks/lib-nats-subject/events/nats'


test('publishExecutionRequest emits task execution request', async () => {
  const published = []
  const natsContext = {
    publish: async (subject, payload) => published.push({ subject, payload: JSON.parse(payload) }),
  }

  await publishExecutionRequest({
    rootCtx: { natsContext },
    routeCtx: taskStartedSpec.context,
    scope: {
      instanceId: 'instance-task',
      componentHash: 'hash-task',
      name: 'taskA',
      deps: { data: { input: 1 } },
    },
  })

  const subject = createBasicSubject(natsEvents['*'].gateway['*']['*'].cmd.component.compute_function.v1['*']).forPublish()
    .env('prod')
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
