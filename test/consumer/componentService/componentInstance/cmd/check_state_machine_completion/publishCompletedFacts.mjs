import test from 'node:test'
import assert from 'node:assert/strict'

import { create as createSubject } from '@liquid-bricks/lib-nats-subject/create/basic'
import { events as natsEvents } from '@liquid-bricks/lib-nats-subject/events/nats'

import { publishCompletedFacts } from '../../../../../../core/componentInstance/cmd/check_state_machine_completion/publishCompletedFacts.js'

test('publishes one state-machine completed domain fact per completed traversal result', async () => {
  const calls = []
  const emits = {
    'domain.vertex.stateMachine.completed.v1':
      natsEvents['*'].domain['*']['*'].vertex.stateMachine.completed.v1['*'],
  }

  await publishCompletedFacts({
    scope: {
      completedStateMachines: [
        { instanceId: 'instance-1', stateMachineId: 'state-machine-1' },
        { instanceId: 'instance-2', stateMachineId: 'state-machine-2' },
      ],
    },
    rootCtx: { natsContext: { publish: async (...args) => calls.push(args) } },
    routeCtx: { emits },
  })

  const expectedSubject = createSubject(
    natsEvents['*'].domain['*']['*'].vertex.stateMachine.completed.v1['*'],
  )
    .forPublish()
    .env('prod')
    .build()

  assert.equal(calls.length, 2)
  for (const [subject] of calls) assert.equal(subject, expectedSubject)

  const facts = calls.map(([, payload]) => JSON.parse(payload).data)
  for (const fact of facts) {
    assert.equal(typeof fact.updatedAt, 'string')
    assert.equal(Number.isNaN(Date.parse(fact.updatedAt)), false)
  }
  assert.deepEqual(facts.map(({ updatedAt, ...fact }) => fact), [
    { instanceId: 'instance-1', stateMachineId: 'state-machine-1' },
    { instanceId: 'instance-2', stateMachineId: 'state-machine-2' },
  ])
})

test('publishes no facts when no state machines completed', async () => {
  const calls = []

  await publishCompletedFacts({
    scope: { completedStateMachines: [] },
    rootCtx: { natsContext: { publish: async (...args) => calls.push(args) } },
    routeCtx: {
      emits: {
        'domain.vertex.stateMachine.completed.v1':
          natsEvents['*'].domain['*']['*'].vertex.stateMachine.completed.v1['*'],
      },
    },
  })

  assert.deepEqual(calls, [])
})
