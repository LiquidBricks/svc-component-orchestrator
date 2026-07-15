import { ackMessage, decodeData, skipIfLocked } from '../../../../middleware/index.js'
import { loadData } from './loadData/index.js'
import { publishStartedFact } from './publishStartedFact.js'
import { create as createSubject } from '@liquid-bricks/lib-nats-subject/create/basic'
import { events as natsEvents } from '@liquid-bricks/lib-nats-subject/events/nats'

export const path = createSubject(natsEvents['*'].component_service['*']['*'].cmd.task.start.v1['*'])
  .forSubscribe()
  .toObject()

export const emits = {
  'domain.edge.has_task_state.started.v1':
    natsEvents['*'].domain['*']['*'].edge.has_task_state.started.v1['*'],
}

export const spec = {
  context: { emits },
  decode: [
    decodeData(['instanceId', 'stateId']),
  ],
  pre: [
    skipIfLocked(['instanceId', 'stateId']),
    loadData,
  ],
  handler: publishStartedFact,
  post: [
    ackMessage,
  ]
}
