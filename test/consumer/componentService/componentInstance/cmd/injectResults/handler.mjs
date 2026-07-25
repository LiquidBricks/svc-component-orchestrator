import test from 'node:test'
import assert from 'node:assert/strict'
import { create as createBasicSubject } from '@liquid-bricks/lib-nats-subject/create/basic'

import { handler } from '../../../../../../core/componentInstance/cmd/injectResults/handler.js'
import { spec as injectResultsSpec } from '../../../../../../core/componentInstance/cmd/injectResults/index.js'

const scope = Object.freeze({
  instanceId: 'source-instance',
  instanceVertexId: 'source-instance-vertex',
  stateMachineId: 'source-state-machine',
  stateEdgeId: 'source-state-edge',
  type: 'task',
  result: { value: 42 },
  updatedAt: '2026-07-20T12:00:00.000Z',
})

test('handler publishes one source-level injected domain fact', async () => {
  const published = []
  const output = await handler({
    rootCtx: {
      natsContext: {
        publish: async (subject, payload) => published.push({
          subject,
          data: JSON.parse(payload).data,
        }),
      },
    },
    routeCtx: injectResultsSpec.context,
    scope,
  })

  assert.equal(published.length, 1)
  const [fact] = published
  assert.equal(
    fact.subject,
    createBasicSubject(injectResultsSpec.context.emits['domain.edge.injects_into.injected.v1'])
      .forPublish()
      .env('prod')
      .build(),
  )
  assert.equal(output.updatedAt, scope.updatedAt)
  assert.deepEqual(fact.data, scope)
})

test('handler propagates injected fact publish failures', async () => {
  const failure = new Error('publish failed')
  await assert.rejects(
    handler({
      rootCtx: { natsContext: { publish: async () => { throw failure } } },
      routeCtx: injectResultsSpec.context,
      scope,
    }),
    (error) => error === failure,
  )
})
