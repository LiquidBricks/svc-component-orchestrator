import { create as createSubject } from '@liquid-bricks/lib-nats-subject/create/basic'

export async function publishExecutionRequest({
  scope: { instanceId, componentHash, name, deps },
  rootCtx: { natsContext },
  routeCtx: { emits },
}) {
  await natsContext.publish(
    createSubject(emits['gateway.cmd.component.compute_function.v1']).forPublish().env('prod').build(),
    JSON.stringify({ data: { instanceId, deps, componentHash, name, type: 'data' } }),
  )
}
