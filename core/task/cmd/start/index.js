import { ackMessage, decodeData, skipIfLocked } from '../../../../middleware/index.js'
import { handler } from './handler.js'
import { loadData } from './loadData/index.js'
import { publishExecutionRequest } from './publishExecutionRequest.js'

export const path = { channel: 'cmd', entity: 'task', action: 'start' }
export const spec = {
  decode: [
    decodeData(['instanceId', 'stateId']),
  ],
  pre: [
    skipIfLocked(['instanceId', 'stateId']),
    loadData,
  ],
  handler,
  post: [
    publishExecutionRequest,
    ackMessage,
  ]
}
