import test from 'node:test'
import assert from 'node:assert/strict'

import { create as createBasicSubject } from '@liquid-bricks/lib-nats-subject/create/basic'

import { publishEvents } from '../../../../../../../core/component/cmd/register/publishEvents/index.js'

test('publishEvents publishes component registered event', async () => {
  const calls = []
  const natsContext = { publish: async (...args) => calls.push(args) }
  const hash = 'hash-registered'

  await publishEvents({
    rootCtx: { natsContext },
    scope: { component: { hash } },
  })

  assert.equal(calls.length, 1)
  const [subject, payload] = calls[0]

  const expectedSubject = createBasicSubject()
    .env('prod')
    .ns('component-service')
    .entity('component')
    .channel('evt')
    .action('registered')
    .version('v1')
    .build()

  assert.equal(subject, expectedSubject)
  assert.deepEqual(JSON.parse(payload), { data: { hash } })
})
