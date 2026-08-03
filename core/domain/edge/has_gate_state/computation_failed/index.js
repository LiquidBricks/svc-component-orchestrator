import { ackMessage, decodeData } from '../../../../../middleware/index.js'
import { path } from './subject.js'
import { validatePayload } from './validatePayload.js'

function handler() {}

export { path }

export const emits = {}

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
    ackMessage,
  ],
}
