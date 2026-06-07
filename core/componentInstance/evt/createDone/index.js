import { ackMessage, decodeData } from '../../../../middleware/index.js'
import { handler } from './handler.js'
import { create as createSubject } from '@liquid-bricks/lib-nats-subject/create/basic'
import { events as natsEvents } from '@liquid-bricks/lib-nats-subject/events/nats'

export const path = createSubject(natsEvents['*'].component_service['*']['*'].evt.componentInstance.createDone.v1['*'])
  .forSubscribe()
  .toObject()

export const spec = {
  decode: [
    // Extract main properties from event payload
    decodeData(['instanceId', 'componentHash'])
  ],
  pre: [],
  handler,
  post: [
    ackMessage,
  ]
}
