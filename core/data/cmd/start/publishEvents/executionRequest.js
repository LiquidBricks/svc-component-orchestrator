import { create as createBasicSubject } from '@liquid-bricks/lib-nats-subject/create/basic'

import { events as natsEvents } from '@liquid-bricks/lib-nats-subject/events/nats'


export async function executionRequest({ scope: { instanceId, componentHash, name, deps }, rootCtx: { natsContext } }) {
  const subject = createBasicSubject(natsEvents['*'].component_service['*']['*'].exec.component.compute_result.v1['*']).forPublish()
    .env('prod')

  await natsContext.publish(
    subject.build(),
    JSON.stringify({ data: { instanceId, deps, componentHash, name, type: 'data' } })
  )
}
