import { create as createSubject } from '@liquid-bricks/lib-nats-subject/create/basic'
import { events as natsEvents } from '@liquid-bricks/lib-nats-subject/events/nats'
import { ackMessage, decodeData } from '../../../../../middleware/index.js'
import { publishResultComputedFact } from './publishResultComputedFact.js'
import { loadData } from '../_helper/loadData.js'
import { validatePayload } from '../_helper/validatePayload.js'

export const path = createSubject(natsEvents['*'].component_service['*'].function_result.evt.component.compute_function.v1.gate)
  .forSubscribe()
  .toObject()

export const spec = {
  decode: [
    decodeData(['instanceId', 'name', 'result']),
  ],
  pre: [
    validatePayload,
    loadData,
  ],
  handler: publishResultComputedFact,
  post: [
    ackMessage,
  ]
}

export { getCodeLocation } from '../_helper/getCodeLocation.js'
