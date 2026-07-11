import { ackMessage, decodeData } from '../../../../middleware/index.js'
import { create as createSubject } from '@liquid-bricks/lib-nats-subject/create/basic'
import { events as natsEvents } from '@liquid-bricks/lib-nats-subject/events/nats'
import { handler } from './handler.js'
import { publishEvents } from './publishEvents/index.js'
import { validatePayload } from './validatePayload.js'

export const path = createSubject(natsEvents['*'].component_service['*']['*'].cmd.componentInstance.injectResults.v1['*'])
  .forSubscribe()
  .toObject()

export const emits = {
  'component_service.function_result.evt.component.compute_function.v1.data':
    natsEvents['*'].component_service['*'].function_result.evt.component.compute_function.v1.data,
  'component_service.function_result.evt.component.compute_function.v1.task':
    natsEvents['*'].component_service['*'].function_result.evt.component.compute_function.v1.task,
}

export const spec = {
  context: { emits },
  decode: [
    decodeData(['instanceId', 'instanceVertexId', 'stateMachineId', 'stateEdgeId', 'type', 'result']),
  ],
  pre: [
    validatePayload,
  ],
  handler,
  post: [
    publishEvents,
    ackMessage,
  ],
}
