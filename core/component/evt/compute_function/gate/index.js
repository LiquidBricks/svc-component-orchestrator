import { create as createSubject } from '@liquid-bricks/lib-nats-subject/create/basic'
import { events as natsEvents } from '@liquid-bricks/lib-nats-subject/events/nats'
import { ackMessage, decodeData } from '../../../../../middleware/index.js'
import { completeStateMachineIfFinished } from '../_helper/completeStateMachineIfFinished.js'
import { handler } from './handler.js'
import { loadData } from '../_helper/loadData.js'
import { publishStartIfPassed } from './publishStartIfPassed.js'
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
  handler,
  post: [
    publishStartIfPassed,
    completeStateMachineIfFinished,
    ackMessage,
  ]
}

export { getCodeLocation } from '../_helper/getCodeLocation.js'
