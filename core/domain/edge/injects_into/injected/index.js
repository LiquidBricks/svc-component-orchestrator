import { events as natsEvents } from '@liquid-bricks/lib-nats-subject/events/nats'
import { ackMessage, decodeData } from '../../../../../middleware/index.js'
import { publishComputeFunctionEvents } from './publishComputeFunctionEvents.js'
import { path } from './subject.js'
import { validatePayload } from './validatePayload.js'

function handler() {}

export { path }

export const emits = {
  'component_service.function_result.evt.component.compute_function.v1.data':
    natsEvents['*'].component_service['*'].function_result.evt.component.compute_function.v1.data,
  'component_service.function_result.evt.component.compute_function.v1.task':
    natsEvents['*'].component_service['*'].function_result.evt.component.compute_function.v1.task,
}

export const spec = {
  context: { emits },
  decode: [
    decodeData(['instanceId', 'instanceVertexId', 'stateMachineId', 'stateEdgeId', 'type', 'result', 'updatedAt']),
  ],
  pre: [validatePayload],
  handler,
  post: [publishComputeFunctionEvents, ackMessage],
}
