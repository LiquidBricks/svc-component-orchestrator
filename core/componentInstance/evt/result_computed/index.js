import { ackMessage, decodeData } from '../../../../middleware/index.js'
import { findStateEdge } from './findStateEdge.js'
import { handler } from './handler.js'
import { loadData } from './loadData/index.js'
import { publishEvents } from './publishEvents/index.js'
import { validatePayload } from './validatePayload.js'

export const path = { channel: 'evt', entity: 'componentInstance', action: 'result_computed' }
export const spec = {
  decode: [
    decodeData(['instanceId', 'type', 'name', 'result']),
  ],
  pre: [
    validatePayload,
    loadData,
    findStateEdge,
  ],
  handler,
  post: [
    publishEvents,
    ackMessage,
  ]
}

export { getCodeLocation } from './getCodeLocation.js'
