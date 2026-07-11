import { create as createBasicSubject } from '@liquid-bricks/lib-nats-subject/create/basic'

export async function publishExecutionRequest({
  scope: { instanceId, componentHash, name, deps },
  rootCtx: { natsContext },
  routeCtx: { emits },
}) {
  const commandSubject = createBasicSubject(emits['gateway.cmd.component.compute_function.v1']).forPublish()
    .env('prod')

  await natsContext.publish(
    commandSubject.build(),
    JSON.stringify({ data: { instanceId, deps, componentHash, name, type: 'task' } })
  )
}
