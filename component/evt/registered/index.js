import { ackMessage, decodeData } from '../../../middleware.js'
import { handler } from './handler.js'
import { validatePayload } from './validatePayload.js'

export const path = { channel: 'evt', entity: 'component', action: 'registered' }
export const spec = {
  decode: [
    // Extract only the hash from message.data
    decodeData(['hash']),
    validatePayload,
  ],
  pre: [],
  handler,
  post: [
    ackMessage,
  ]
}
