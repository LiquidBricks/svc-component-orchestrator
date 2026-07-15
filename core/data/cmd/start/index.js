import { ackMessage, decodeData } from '../../../../middleware/index.js'
import { loadData } from './loadData/index.js'
import { publishStartedFact } from './publishStartedFact.js'
import { create as createSubject } from '@liquid-bricks/lib-nats-subject/create/basic'
import { events as natsEvents } from '@liquid-bricks/lib-nats-subject/events/nats'

export const path = createSubject(natsEvents['*'].component_service['*']['*'].cmd.data.start.v1['*'])
  .forSubscribe()
  .toObject()

export const emits = {
  'domain.edge.has_data_state.started.v1':
    natsEvents['*'].domain['*']['*'].edge.has_data_state.started.v1['*'],
}

export const spec = {
  context: { emits },
  decode: [
    decodeData(['instanceId', 'stateId']),
  ],
  pre: [
    loadData,
  ],
  handler: publishStartedFact,
  post: [
    ackMessage,
  ]
}
