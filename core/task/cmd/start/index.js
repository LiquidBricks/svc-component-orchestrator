import { ackMessage, decodeData, skipIfLocked } from '../../../../middleware/index.js'
import { handler } from './handler.js'
import { loadData } from './loadData/index.js'
import { publishExecutionRequest } from './publishExecutionRequest.js'
import { create as createSubject } from '@liquid-bricks/lib-nats-subject/create/basic'
import { events as natsEvents } from '@liquid-bricks/lib-nats-subject/events/nats'

export const path = createSubject(natsEvents['*'].component_service['*']['*'].cmd.task.start.v1['*'])
  .forSubscribe()
  .toObject()

export const emits = {
  'gateway.cmd.component.compute_function.v1':
    natsEvents['*'].gateway['*']['*'].cmd.component.compute_function.v1['*'],
}

export const spec = {
  context: { emits },
  decode: [
    decodeData(['instanceId', 'stateId']),
  ],
  pre: [
    skipIfLocked(['instanceId', 'stateId']),
    loadData,
  ],
  handler,
  post: [
    publishExecutionRequest,
    ackMessage,
  ]
}
