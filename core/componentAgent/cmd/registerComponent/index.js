import { ackMessage, decodeData } from '../../../../middleware/index.js'
import { handler } from './handler/index.js'
import { republishIfGatesMissing } from './republishIfGatesMissing.js'
import { republishIfImportsMissing } from './republishIfImportsMissing.js'
import { skipIfExists } from './skipIfExists.js'
import { publishEvents } from './publishEvents/index.js'
import { validatePayload } from './validatePayload/index.js'

export const path = { channel: 'cmd', entity: 'componentAgent', action: 'registerComponent' }

export const spec = {
  decode: [
    decodeData(['component', 'agentID']),
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
