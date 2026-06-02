import { create as createBasicSubject } from '@liquid-bricks/lib-nats-subject/create/basic'

import { events as natsEvents } from '@liquid-bricks/lib-nats-subject/events/nats'


export async function startDataStates({ scope: { instanceId, dataStateIds = [] }, rootCtx: { natsContext } }) {
  if (!dataStateIds.length) return

  const subject = createBasicSubject(natsEvents['*'].component_service['*']['*'].cmd.data.start.v1['*'])
    .env('prod')

  for (const stateId of dataStateIds) {
    await natsContext.publish(
      subject.build(),
      JSON.stringify({ data: { instanceId, stateId } })
    )
  }
}
