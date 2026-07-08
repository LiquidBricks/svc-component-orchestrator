import { ackMessage, decodeData } from '../../../../middleware/index.js'
import { handler } from './handler.js'
import { loadData } from './loadData/index.js'
import { publishEvents } from './publishEvents/index.js'
import { validatePayload } from './validatePayload.js'
import { create as createSubject } from '@liquid-bricks/lib-nats-subject/create/basic'
import { events as natsEvents } from '@liquid-bricks/lib-nats-subject/events/nats'

export const path = createSubject(natsEvents['*'].component_service['*']['*'].cmd.componentInstance.start_dependants.v1['*'])
  .forSubscribe()
  .toObject()

export const spec = {
  decode: [
    decodeData(['instanceId', 'stateEdgeId', 'type', 'status', 'stateEdgeStatus', 'result']),
  ],
  pre: [
    validatePayload,
    ...loadData,
  ],
  handler,
  post: [
    publishEvents,
    ackMessage,
  ]
}
