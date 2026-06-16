import { ackMessage, decodeData } from '../../../../middleware/index.js'
import { create as createSubject } from '@liquid-bricks/lib-nats-subject/create/basic'
import { events as natsEvents } from '@liquid-bricks/lib-nats-subject/events/nats'
import { handler } from './handler.js'
import { publishInjectedComputeResultDoneEvents } from '../computeResultDone/publishEvents/publishInjectedComputeResultDoneEvents.js'
import { validatePayload } from './validatePayload.js'

export const path = createSubject(natsEvents['*'].component_service['*']['*'].evt.componentInstance.processInjectedComputeResultDone.v1['*'])
  .forSubscribe()
  .toObject()

export const spec = {
  decode: [
    decodeData(['instanceId', 'instanceVertexId', 'stateMachineId', 'stateEdgeId', 'type', 'result']),
  ],
  pre: [
    validatePayload,
  ],
  handler,
  post: [
    publishInjectedComputeResultDoneEvents,
    ackMessage,
  ],
}
