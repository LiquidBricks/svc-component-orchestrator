import { ackMessage, decodeData } from '../../../../middleware/index.js'
import { handler } from './handler/index.js'
import { loadData } from './loadData/index.js'
import { publishCreatedFacts } from './publishCreatedFacts.js'
import { validatePayload } from './validatePayload.js'
import { create as createSubject } from '@liquid-bricks/lib-nats-subject/create/basic'
import { events as natsEvents } from '@liquid-bricks/lib-nats-subject/events/nats'

export const path = createSubject(natsEvents['*'].component_service['*']['*'].cmd.componentInstance.create.v1['*'])
  .forSubscribe()
  .toObject()

export const emits = {
  'domain.vertex.componentInstance.created.v1':
    natsEvents['*'].domain['*']['*'].vertex.componentInstance.created.v1['*'],
}

export const spec = {
  context: { emits },
  decode: [
    decodeData(['componentHash', 'instanceId']),
    validatePayload,
  ],
  pre: [
    ...loadData,
  ],
  handler,
  post: [
    publishCreatedFacts,
    ackMessage,
  ],
}
