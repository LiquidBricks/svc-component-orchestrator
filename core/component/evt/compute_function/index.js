import { ackMessage, decodeData } from '../../../../middleware/index.js'
import { findStateEdge } from './findStateEdge.js'
import { handler } from './handler.js'
import { loadData } from './loadData/index.js'
import { publishEvents } from './publishEvents/index.js'
import { validatePayload } from './validatePayload.js'
import { create as createSubject } from '@liquid-bricks/lib-nats-subject/create/basic'
import { events as natsEvents } from '@liquid-bricks/lib-nats-subject/events/nats'

export const path = createSubject(natsEvents['*'].component_service['*'].function_result.evt.component.compute_function.v1['*'])
  .forSubscribe()
  .toObject()

export const spec = {
  decode: [
    decodeData(['instanceId', 'type', 'name', 'result']),
  ],
  pre: [
    validatePayload,
    loadData,
    findStateEdge,
  ],
  handler,
  post: [
    publishEvents,
    ackMessage,
  ]
}

export { getCodeLocation } from './getCodeLocation.js'
