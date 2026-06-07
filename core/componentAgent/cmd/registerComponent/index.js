import { ackMessage, decodeData } from '../../../../middleware/index.js'
import { handler } from './handler/index.js'
import { republishIfGatesMissing } from './republishIfGatesMissing.js'
import { republishIfImportsMissing } from './republishIfImportsMissing.js'
import { skipIfExists } from './skipIfExists.js'
import { publishEvents } from './publishEvents/index.js'
import { validatePayload } from './validatePayload/index.js'
import { create as createSubject } from '@liquid-bricks/lib-nats-subject/create/basic'
import { events as natsEvents } from '@liquid-bricks/lib-nats-subject/events/nats'

export const path = createSubject(natsEvents['*'].component_service['*']['*'].cmd.componentAgent.registerComponent.v1['*'])
  .forSubscribe()
  .toObject()

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
