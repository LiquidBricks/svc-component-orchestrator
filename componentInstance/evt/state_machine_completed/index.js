import { ackMessage, decodeData } from '../../../middleware.js'
import { handler } from './handler.js'
import { validatePayload } from './validatePayload.js'

export const path = { channel: 'evt', entity: 'componentInstance', action: 'state_machine_completed' }
export const spec = {
  decode: [
    decodeData(['instanceId', 'stateMachineId']),
  ],
  pre: [
    validatePayload,
  ],
  handler,
  post: [
    ackMessage,
  ],
}
