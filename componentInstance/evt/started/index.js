import { ackMessage, decodeData } from '../../../middleware.js'
import { handler } from './handler.js'

export const path = { channel: 'evt', entity: 'componentInstance', action: 'started' }
export const spec = {
  decode: [
    decodeData(['instanceId'])
  ],
  pre: [],
  handler,
  post: [
    ackMessage,
  ]
}
