import { ackMessage, decodeData, skipIfLocked } from '../../../../middleware/index.js'
import { handler } from './handler.js'
import { loadData } from './loadData/index.js'
import { publishExecutionRequest } from './publishExecutionRequest.js'
import { create as createSubject } from '@liquid-bricks/lib-nats-subject/create/basic'
import { events as natsEvents } from '@liquid-bricks/lib-nats-subject/events/nats'

export const path = createSubject(natsEvents['*'].component_service['*']['*'].cmd.task.start.v1['*'])
  .forSubscribe()
  .toObject()

export const spec = {
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
