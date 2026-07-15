import { events as natsEvents } from '@liquid-bricks/lib-nats-subject/events/nats'
import { ackMessage, decodeData } from '../../../../../middleware/index.js'
import { publishExecutionRequest } from './publishExecutionRequest.js'
import { path } from './subject.js'
import { validatePayload } from './validatePayload.js'

function handler() {}

export { path }

export const emits = {
  'gateway.cmd.component.compute_function.v1':
    natsEvents['*'].gateway['*']['*'].cmd.component.compute_function.v1['*'],
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
      'nodeId',
      'componentHash',
      'name',
      'deps',
      'type',
      'status',
      'stateEdgeStatus',
      'updatedAt',
    ]),
  ],
  pre: [validatePayload],
  handler,
  post: [publishExecutionRequest, ackMessage],
}
