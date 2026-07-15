import { create as createSubject } from '@liquid-bricks/lib-nats-subject/create/basic'
import { events as natsEvents } from '@liquid-bricks/lib-nats-subject/events/nats'

export const path = createSubject(natsEvents['*'].domain['*']['*'].edge.has_data_state.started.v1['*'])
  .forSubscribe()
  .toObject()
