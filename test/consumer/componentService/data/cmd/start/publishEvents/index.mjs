import test from 'node:test'
import assert from 'node:assert/strict'
import { create as createBasicSubject } from '@liquid-bricks/lib-nats-subject/create/basic'

import { publishEvents } from '../../../../../../../core/data/cmd/start/publishEvents/index.js'
import { spec as dataStartSpec } from '../../../../../../../core/data/cmd/start/index.js'
import { runHookGroup } from '../../../../../../util/invokeRoute.js'

import { events as natsEvents } from '@liquid-bricks/lib-nats-subject/events/nats'


test('publishEvents emits execution request for data', async () => {
  const published = []
  const natsContext = {
    publish: async (subject, payload) => published.push({ subject, payload: JSON.parse(payload) }),
  }

  await runHookGroup(publishEvents, {
    rootCtx: { natsContext },
    routeCtx: dataStartSpec.context,
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
