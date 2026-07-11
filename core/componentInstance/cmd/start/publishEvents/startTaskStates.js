import { create as createBasicSubject } from '@liquid-bricks/lib-nats-subject/create/basic'

export async function startTaskStates({
  scope: { instanceId, taskStateIds = [] },
  rootCtx: { natsContext },
  routeCtx: { emits },
}) {
  if (!taskStateIds.length) return

  const subject = createBasicSubject(emits['component_service.cmd.task.start.v1']).forPublish()
    .env('prod')

  for (const stateId of taskStateIds) {
    await natsContext.publish(
      subject.build(),
      JSON.stringify({ data: { instanceId, stateId } })
    )
  }
}
