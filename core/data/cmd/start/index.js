import { ackMessage, decodeData } from '../../../../middleware/index.js'
import { handler } from './handler.js'
import { loadData } from './loadData/index.js'
import { publishEvents } from './publishEvents/index.js'

export const path = { channel: 'cmd', entity: 'data', action: 'start' }
export const spec = {
  decode: [
    decodeData(['instanceId', 'stateId']),
  ],
  pre: [
    loadData,
  ],
  handler,
  post: [
    publishEvents,
    ackMessage,
  ]
}
