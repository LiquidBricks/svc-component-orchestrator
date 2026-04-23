import { ackMessage, decodeData } from '../../../../middleware/index.js'
import { handler } from './handler/index.js'
import { loadData } from './loadData/index.js'
import { publishEvents } from './publishEvents/index.js'
import { validatePayload } from './validatePayload.js'

export const path = { channel: 'cmd', entity: 'componentInstance', action: 'create' }
export const spec = {
  decode: [
    decodeData(['componentHash', 'instanceId']),
    validatePayload,
  ],
  pre: [
    ...loadData,
  ],
  handler,
  post: [
    ackMessage,
    publishEvents,
  ],
}
