import { create as createSubject } from '@liquid-bricks/lib-nats-subject/create/basic'

export async function startDataStates({
  scope: { instanceId, dataStateIds = [] },
  rootCtx: { natsContext },
  routeCtx: { emits },
}) {
  if (!dataStateIds.length) return
  const subject = createSubject(emits['component_service.cmd.data.start.v1'])
    .forPublish()
    .env('prod')
    .build()

  for (const stateId of dataStateIds) {
    await natsContext.publish(subject, JSON.stringify({ data: { instanceId, stateId } }))
  }
}
