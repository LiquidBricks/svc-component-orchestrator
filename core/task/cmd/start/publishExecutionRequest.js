import { create as createBasicSubject } from '@liquid-bricks/lib-nats-subject/create/basic'

import { events as natsEvents } from '@liquid-bricks/lib-nats-subject/events/nats'


export async function publishExecutionRequest({ scope: { instanceId, componentHash, name, deps }, rootCtx: { natsContext } }) {
  const commandSubject = createBasicSubject(natsEvents['*'].gateway['*']['*'].cmd.component.compute_function.v1['*']).forPublish()
    .env('prod')

  await natsContext.publish(
    commandSubject.build(),
    JSON.stringify({ data: { instanceId, deps, componentHash, name, type: 'task' } })
  )
}
