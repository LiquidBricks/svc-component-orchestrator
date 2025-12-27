import { ackMessage, decodeData } from '../../../middleware.js'
import { handler } from './handler.js'
import { loadData } from './loadData/index.js'
import { publishExecutionRequest } from './publishExecutionRequest.js'

export const path = { channel: 'cmd', entity: 'task', action: 'start' }
export const spec = {
  decode: [
    decodeData(['instanceId', 'stateId']),
  ],
  pre: [
    loadData,
  ],
  handler,
  post: [
    publishExecutionRequest,
    ackMessage,
  ]
}
