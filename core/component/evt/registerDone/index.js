import { ackMessage, decodeData } from '../../../../middleware/index.js'
import { handler } from './handler.js'
import { validatePayload } from './validatePayload.js'
import { create as createSubject } from '@liquid-bricks/lib-nats-subject/create/basic'
import { events as natsEvents } from '@liquid-bricks/lib-nats-subject/events/nats'

export const path = createSubject(natsEvents['*'].component_service['*']['*'].evt.component.registerDone.v1['*'])
  .forSubscribe()
  .toObject()

export const spec = {
  decode: [
    // Extract only the hash from message.data
    decodeData(['hash']),
    validatePayload,
  ],
  pre: [],
  handler,
  post: [
    ackMessage,
  ]
}
