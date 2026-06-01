import test from 'node:test'
import assert from 'node:assert/strict'

import { create as createBasicSubject } from '@liquid-bricks/lib-nats-subject/create/basic'

import { publishEvents } from '../../../../../../../core/componentAgent/cmd/registerComponent/publishEvents/index.js'

test('publishEvents publishes component registerDone and provider registration events', async () => {
  const calls = []
  const natsContext = { publish: async (...args) => calls.push(args) }
  const hash = 'hash-register-done'

  await publishEvents({
    rootCtx: { natsContext },
    scope: { agentID: 'agent-1', component: { hash } },
  })

  assert.equal(calls.length, 2)
  const [subject, payload] = calls[0]

  const expectedSubject = createBasicSubject()
    .env('prod')
    .ns('component-service')
    .entity('component')
    .channel('evt')
    .action('registerDone')
    .version('v1')
    .build()

  assert.equal(subject, expectedSubject)
  assert.deepEqual(JSON.parse(payload), { data: { hash } })
  const [providerSubject, providerPayload] = calls[1]
  const expectedProviderSubject = createBasicSubject()
    .env('prod')
    .ns('component-service')
    .entity('componentAgent')
    .channel('exec')
    .action('cmdRegisterProvidingAgentsComponent')
    .version('v1')
    .id('agent-1')
    .build()

  assert.equal(providerSubject, expectedProviderSubject)
  assert.deepEqual(JSON.parse(providerPayload), { data: { agentID: 'agent-1', hash } })
})
