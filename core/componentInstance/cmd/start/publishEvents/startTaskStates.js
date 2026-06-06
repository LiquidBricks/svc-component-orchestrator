import { create as createBasicSubject } from '@liquid-bricks/lib-nats-subject/create/basic'

import { events as natsEvents } from '@liquid-bricks/lib-nats-subject/events/nats'


export async function startTaskStates({ scope: { instanceId, taskStateIds = [] }, rootCtx: { natsContext } }) {
  if (!taskStateIds.length) return

  const subject = createBasicSubject(natsEvents['*'].component_service['*']['*'].cmd.task.start.v1['*']).forPublish()
    .env('prod')

  for (const stateId of taskStateIds) {
    await natsContext.publish(
      subject.build(),
      JSON.stringify({ data: { instanceId, stateId } })
    )
  }
}
