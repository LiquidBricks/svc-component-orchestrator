import { ackMessage, decodeData } from '../../../middleware.js'
import { handler } from './handler/index.js'
import { republishIfGatesMissing } from './republishIfGatesMissing.js'
import { republishIfImportsMissing } from './republishIfImportsMissing.js'
import { skipIfExists } from './skipIfExists.js'
import { publishEvents } from './publishEvents/index.js'
import { validatePayload } from './validatePayload/index.js'

export const path = { channel: 'cmd', entity: 'component', action: 'register' }

export const spec = {
  decode: [
    decodeData('component'),
    validatePayload,
  ],
  pre: [
    skipIfExists,
    republishIfImportsMissing,
    republishIfGatesMissing,
  ],
  handler,
  post: [
    ackMessage,
    publishEvents,
  ],
}
