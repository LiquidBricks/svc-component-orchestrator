import { create as createSubject } from '@liquid-bricks/lib-nats-subject/create/basic'
import { events as natsEvents } from '@liquid-bricks/lib-nats-subject/events/nats'

export const path = createSubject(natsEvents['*'].domain['*']['*'].edge.uses_gate.result_computed.v1['*'])
  .forSubscribe()
  .toObject()
