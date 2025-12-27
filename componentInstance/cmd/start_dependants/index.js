import { ackMessage, decodeData } from '../../../middleware.js'
import { handler } from './handler.js'
import { loadData } from './loadData/index.js'
import { publishEvents } from './publishEvents/index.js'
import { validatePayload } from './validatePayload.js'

export const path = { channel: 'cmd', entity: 'componentInstance', action: 'start_dependants' }
export const spec = {
  decode: [
    decodeData(['instanceId', 'stateEdgeId', 'type']),
  ],
  pre: [
    validatePayload,
    ...loadData,
  ],
  handler,
  post: [
    publishEvents,
    ackMessage,
  ]
}
