import { ackMessage, decodeData } from '../../../../../middleware/index.js'
import { completeStateMachineIfFinished } from './completeStateMachineIfFinished.js'
import { publishInjectResultsCommand } from './publishInjectResultsCommand.js'
import { publishStartDependantsCommand } from './publishStartDependantsCommand.js'
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
      'stateEdgeId',
      'stateId',
      'type',
      'name',
      'result',
      'resultValue',
      'status',
      'stateEdgeStatus',
      'updatedAt',
    ]),
  ],
  pre: [
    validatePayload,
  ],
  handler,
  post: [
    {
      completeStateMachineIfFinished,
      publishInjectResultsCommand,
      publishStartDependantsCommand,
    },
    ackMessage,
  ],
}
