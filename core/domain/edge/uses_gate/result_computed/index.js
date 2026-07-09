import { ackMessage, decodeData } from '../../../../../middleware/index.js'
import { completeStateMachineIfFinished } from '../../../../component/evt/compute_function/_helper/completeStateMachineIfFinished.js'
import { handler } from '../../../../component/evt/compute_function/gate/handler.js'
import { publishStartIfPassed } from '../../../../component/evt/compute_function/gate/publishStartIfPassed.js'
import { validatePayload } from './validatePayload.js'
import { path } from './subject.js'

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
