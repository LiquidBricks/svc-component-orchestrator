import test from 'node:test'
import assert from 'node:assert/strict'

import { create as createSubject } from '@liquid-bricks/lib-nats-subject/create/basic'
import { events as natsEvents } from '@liquid-bricks/lib-nats-subject/events/nats'

import { publishCheckStateMachineCompletionCommand } from '../../../../../core/domain/_helper/publishCheckStateMachineCompletionCommand.js'

test('publishes the completion-check command with the allowlisted in-flight payload', async () => {
  const calls = []
  const emits = {
    'component_service.cmd.componentInstance.check_state_machine_completion.v1':
      natsEvents['*'].component_service['*']['*'].cmd.componentInstance.check_state_machine_completion.v1['*'],
  }
  const scope = {
    instanceId: 'instance-1',
    instanceVertexId: 'instance-vertex-1',
    stateMachineId: 'state-machine-1',
    stateEdgeId: 'state-edge-1',
    stateEdgeStatus: 'provided',
    status: 'provided',
    gateInstanceRefId: 'gate-ref-1',
    type: 'gate',
    result: false,
    resultValue: 'false',
    ignored: 'not part of the command contract',
  }

  await publishCheckStateMachineCompletionCommand({
    scope,
    rootCtx: { natsContext: { publish: async (...args) => calls.push(args) } },
    routeCtx: { emits },
  })

  assert.equal(calls.length, 1)
  const [subject, payload] = calls[0]
  const expectedSubject = createSubject(
    natsEvents['*'].component_service['*']['*'].cmd.componentInstance.check_state_machine_completion.v1['*'],
  )
    .forPublish()
    .env('prod')
    .build()

  assert.equal(subject, expectedSubject)
  assert.deepEqual(JSON.parse(payload), {
    data: {
      instanceId: 'instance-1',
      instanceVertexId: 'instance-vertex-1',
      stateMachineId: 'state-machine-1',
      stateEdgeId: 'state-edge-1',
      stateEdgeStatus: 'provided',
      status: 'provided',
      gateInstanceRefId: 'gate-ref-1',
      type: 'gate',
      result: false,
      resultValue: 'false',
    },
  })
})
