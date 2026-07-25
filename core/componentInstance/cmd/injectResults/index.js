import { ackMessage, decodeData } from '../../../../middleware/index.js'
import { create as createSubject } from '@liquid-bricks/lib-nats-subject/create/basic'
import { events as natsEvents } from '@liquid-bricks/lib-nats-subject/events/nats'
import { handler } from './handler.js'
import { validatePayload } from './validatePayload.js'

export const path = createSubject(natsEvents['*'].component_service['*']['*'].cmd.componentInstance.injectResults.v1['*'])
  .forSubscribe()
  .toObject()

export const emits = {
  'domain.edge.injects_into.injected.v1':
    natsEvents['*'].domain['*']['*'].edge.injects_into.injected.v1['*'],
}

export const spec = {
  context: { emits },
  decode: [
    decodeData(['instanceId', 'instanceVertexId', 'stateMachineId', 'stateEdgeId', 'type', 'result', 'updatedAt']),
  ],
  pre: [
    validatePayload,
  ],
  handler,
  post: [
    ackMessage,
  ],
}
