import test from 'node:test'
import assert from 'node:assert/strict'
import { create as createBasicSubject } from '@liquid-bricks/lib-nats-subject/create/basic'

import { publishExecutionRequest } from '../../../../../../../core/domain/edge/has_data_state/started/publishExecutionRequest.js'
import { spec as dataStartedSpec } from '../../../../../../../core/domain/edge/has_data_state/started/index.js'
import { runHookGroup } from '../../../../../../util/invokeRoute.js'

import { events as natsEvents } from '@liquid-bricks/lib-nats-subject/events/nats'


test('data started reaction emits execution request', async () => {
  const published = []
  const natsContext = {
    publish: async (subject, payload) => published.push({ subject, payload: JSON.parse(payload) }),
  }

  await runHookGroup([publishExecutionRequest], {
    rootCtx: { natsContext },
    routeCtx: dataStartedSpec.context,
    scope: {
      instanceId: 'instance-data',
      componentHash: 'hash-data',
      name: 'inputData',
      deps: { task: { done: true } },
    },
  })

  const subject = createBasicSubject(natsEvents['*'].gateway['*']['*'].cmd.component.compute_function.v1['*']).forPublish()
    .env('prod')
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
