import { ackMessage, decodeData } from '../../../middleware.js'
import { handler } from './handler.js'

export const path = { channel: 'evt', entity: 'componentInstance', action: 'created' }
export const spec = {
  decode: [
    // Extract main properties from event payload
    decodeData(['instanceId', 'componentHash'])
  ],
  pre: [],
  handler,
  post: [
    ackMessage,
  ]
}
