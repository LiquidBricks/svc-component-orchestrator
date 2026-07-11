import { ackMessage, decodeData } from '../../../../middleware/index.js'
import { handler } from './handler.js'
import { loadData } from './loadData/index.js'
import { publishEvents } from './publishEvents/index.js'
import { create as createSubject } from '@liquid-bricks/lib-nats-subject/create/basic'
import { events as natsEvents } from '@liquid-bricks/lib-nats-subject/events/nats'

export const path = createSubject(natsEvents['*'].component_service['*']['*'].cmd.data.start.v1['*'])
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
    loadData,
  ],
  handler,
  post: [
    publishEvents,
    ackMessage,
  ]
}
