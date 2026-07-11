import { ackMessage, decodeData } from '../../../../middleware/index.js'
import { handler } from './handler.js'
import { create as createSubject } from '@liquid-bricks/lib-nats-subject/create/basic'
import { events as natsEvents } from '@liquid-bricks/lib-nats-subject/events/nats'

export const path = createSubject(natsEvents['*'].component_service['*']['*'].cmd.import.start.v1['*'])
  .forSubscribe()
  .toObject()

export const emits = {
  'component_service.cmd.componentInstance.start.v1':
    natsEvents['*'].component_service['*']['*'].cmd.componentInstance.start.v1['*'],
}

export const spec = {
  context: { emits },
  decode: [
    decodeData(['instanceId', 'parentInstanceId']),
  ],
  handler,
  post: [
    ackMessage,
  ],
}
