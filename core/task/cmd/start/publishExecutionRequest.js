import { create as createBasicSubject } from '@liquid-bricks/lib-nats-subject/create/basic'

import { events as natsEvents } from '@liquid-bricks/lib-nats-subject/events/nats'


export async function publishExecutionRequest({ scope: { instanceId, componentHash, name, deps }, rootCtx: { natsContext } }) {
  const execSubject = createBasicSubject(natsEvents['*'].component_service['*']['*'].exec.component.compute_result.v1['*']).forPublish()
    .env('prod')

  await natsContext.publish(
    execSubject.build(),
    JSON.stringify({ data: { instanceId, deps, componentHash, name, type: 'task' } })
  )
}
