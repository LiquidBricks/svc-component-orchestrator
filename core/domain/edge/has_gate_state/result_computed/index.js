import { ackMessage, decodeData } from '../../../../../middleware/index.js'
import { publishStartIfPassed } from './publishStartIfPassed.js'
import { validatePayload } from './validatePayload.js'
import { path } from './subject.js'
import { events as natsEvents } from '@liquid-bricks/lib-nats-subject/events/nats'

function handler() {}

export { path }

export const emits = {
  'domain.vertex.componentInstance.created.v1':
    natsEvents['*'].domain['*']['*'].vertex.componentInstance.created.v1['*'],
  'component_service.function_result.evt.component.compute_function.v1.data':
    natsEvents['*'].component_service['*'].function_result.evt.component.compute_function.v1.data,
  'component_service.function_result.evt.component.compute_function.v1.task':
    natsEvents['*'].component_service['*'].function_result.evt.component.compute_function.v1.task,
  'component_service.cmd.componentInstance.start.v1':
    natsEvents['*'].component_service['*']['*'].cmd.componentInstance.start.v1['*'],
}

export const spec = {
  context: { emits },
  decode: [
    decodeData([
      'instanceId',
      'instanceVertexId',
      'stateMachineId',
      'stateEdgeId',
      'stateId',
      'gateInstanceRefId',
      'type',
      'name',
      'result',
      'resultValue',
      'status',
      'stateEdgeStatus',
      'error',
      'updatedAt',
    ]),
  ],
  pre: [
    validatePayload,
  ],
  handler,
  post: [
    {
      publishStartIfPassed,
    },
    ackMessage,
  ],
}
