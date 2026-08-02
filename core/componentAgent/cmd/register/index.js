import { ackMessage, decodeData } from '../../../../middleware/index.js'
import { registerComponentAgent } from './handler.js'
import { validatePayload } from './validatePayload.js'
import { create as createSubject } from '@liquid-bricks/lib-nats-subject/create/basic'
import { events as natsEvents } from '@liquid-bricks/lib-nats-subject/events/nats'

export const path = createSubject(natsEvents['*'].component_service['*']['*'].cmd.componentAgent.register.v1['*'])
  .forSubscribe()
  .toObject()

export const spec = {
  decode: [
    decodeData(['agentID']),
  ],
  pre: [
    validatePayload,
  ],
  handler: registerComponentAgent,
  post: [
    ackMessage,
  ],
}
