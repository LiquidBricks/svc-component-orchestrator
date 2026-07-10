import { ackMessage, decodeData } from '../../../../../middleware/index.js'
import { completeStateMachineIfFinished } from './completeStateMachineIfFinished.js'
import { publishStartIfPassed } from './publishStartIfPassed.js'
import { validatePayload } from './validatePayload.js'
import { path } from './subject.js'

function handler() {}

export { path }

export const spec = {
  decode: [
    decodeData([
      'instanceId',
      'instanceVertexId',
      'stateMachineId',
      'gateInstanceRefId',
      'type',
      'name',
      'result',
      'resultValue',
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
      completeStateMachineIfFinished,
    },
    ackMessage,
  ],
}
