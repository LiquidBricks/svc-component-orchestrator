import { ackMessage, decodeData } from '../../../../middleware/index.js'
import { handler } from './handler.js'

export const path = { channel: 'cmd', entity: 'gate', action: 'start' }
export const spec = {
  decode: [
    decodeData(['instanceId', 'parentInstanceId']),
  ],
  handler,
  post: [
    ackMessage,
  ],
}
