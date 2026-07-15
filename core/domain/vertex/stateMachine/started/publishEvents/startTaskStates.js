import { create as createSubject } from '@liquid-bricks/lib-nats-subject/create/basic'

export async function startTaskStates({
  scope: { instanceId, taskStateIds = [] },
  rootCtx: { natsContext },
  routeCtx: { emits },
}) {
  if (!taskStateIds.length) return
  const subject = createSubject(emits['component_service.cmd.task.start.v1'])
    .forPublish()
    .env('prod')
    .build()

  for (const stateId of taskStateIds) {
    await natsContext.publish(subject, JSON.stringify({ data: { instanceId, stateId } }))
  }
}
