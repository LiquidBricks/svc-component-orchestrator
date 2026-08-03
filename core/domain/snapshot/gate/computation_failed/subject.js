import { create as createSubject } from '@liquid-bricks/lib-nats-subject/create/basic'
import { events as natsEvents } from '@liquid-bricks/lib-nats-subject/events/nats'

export const path = createSubject(natsEvents['*'].domain['*']['*'].snapshot.gate.computation_failed.v1['*'])
  .forSubscribe()
  .context('delta')
  .toObject()
