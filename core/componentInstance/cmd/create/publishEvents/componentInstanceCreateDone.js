import { create as createBasicSubject } from '@liquid-bricks/lib-nats-subject/create/basic'

import { events as natsEvents } from '@liquid-bricks/lib-nats-subject/events/nats'


export async function componentInstanceCreateDone({ scope: { instanceId, componentHash }, rootCtx: { natsContext } }) {
  const subject = createBasicSubject(natsEvents['*'].component_service['*']['*'].evt.componentInstance.createDone.v1['*']).forPublish()
    .env('prod')

  await natsContext.publish(
    subject.build(),
    JSON.stringify({ data: { instanceId, componentHash } })
  )
}
