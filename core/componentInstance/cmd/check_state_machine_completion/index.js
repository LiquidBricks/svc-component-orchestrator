import { create as createSubject } from '@liquid-bricks/lib-nats-subject/create/basic'
import { events as natsEvents } from '@liquid-bricks/lib-nats-subject/events/nats'
import { ackMessage, decodeData } from '../../../../middleware/index.js'
import { handler } from './handler.js'
import { publishCompletedFacts } from './publishCompletedFacts.js'
import { retryProjectionTimeout } from './retryProjectionTimeout.js'
import { validatePayload } from './validatePayload.js'
import { waitForTriggerProjection } from './waitForTriggerProjection.js'

export const path = createSubject(
  natsEvents['*'].component_service['*']['*'].cmd.componentInstance.check_state_machine_completion.v1['*'],
)
  .forSubscribe()
  .toObject()

export const emits = {
  'domain.vertex.stateMachine.completed.v1':
    natsEvents['*'].domain['*']['*'].vertex.stateMachine.completed.v1['*'],
}

export const spec = {
  context: { emits },
  decode: [
    decodeData([
      'instanceId',
      'instanceVertexId',
      'stateMachineId',
      'stateEdgeId',
      'stateEdgeStatus',
      'status',
      'gateInstanceRefId',
      'type',
      'result',
      'resultValue',
    ]),
  ],
  pre: [
    validatePayload,
    waitForTriggerProjection,
  ],
  onPreError: [
    retryProjectionTimeout,
  ],
  handler,
  post: [
    publishCompletedFacts,
    ackMessage,
  ],
}
