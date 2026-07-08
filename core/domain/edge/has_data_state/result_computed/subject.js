import { create as createSubject } from '@liquid-bricks/lib-nats-subject/create/basic'
import { events as natsEvents } from '@liquid-bricks/lib-nats-subject/events/nats'

const subjectSpec = natsEvents['*']?.domain?.['*']?.['*']?.edge?.has_data_state?.result_computed ?? {
  env: '*',
  ns: 'domain',
  tenant: '*',
  context: '*',
  channel: 'edge',
  entity: 'has_data_state',
  action: 'result_computed',
}

export const path = createSubject(subjectSpec)
  .forSubscribe()
  .toObject()

export function createResultComputedSubject({ env = 'prod' } = {}) {
  return createSubject(subjectSpec)
    .forPublish()
    .env(env)
    .build()
}
