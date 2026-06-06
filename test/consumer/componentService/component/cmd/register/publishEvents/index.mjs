import test from 'node:test'
import assert from 'node:assert/strict'
import { create as createBasicSubject } from '@liquid-bricks/lib-nats-subject/create/basic'

import { publishEvents } from '../../../../../../../core/componentAgent/cmd/registerComponent/publishEvents/index.js'

import { events as natsEvents } from '@liquid-bricks/lib-nats-subject/events/nats'


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

  const expectedSubject = createBasicSubject(natsEvents['*'].component_service['*']['*'].evt.component.registerDone.v1['*']).forPublish()
    .env('prod')
    .build()

  assert.equal(subject, expectedSubject)
  assert.deepEqual(JSON.parse(payload), { data: { hash } })
  const [providerSubject, providerPayload] = calls[1]
  const expectedProviderSubject = createBasicSubject(natsEvents['*'].component_service['*']['*'].exec.componentAgent.cmdRegisterProvidingAgentsComponent.v1['*']).forPublish()
    .env('prod')
    .id('agent-1')
    .build()

  assert.equal(providerSubject, expectedProviderSubject)
  assert.deepEqual(JSON.parse(providerPayload), { data: { agentID: 'agent-1', hash } })
})
