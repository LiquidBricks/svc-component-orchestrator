import { create as createBasicSubject } from '@liquid-bricks/lib-nats-subject/create/basic'

export async function startDataStates({
  scope: { instanceId, dataStateIds = [] },
  rootCtx: { natsContext },
  routeCtx: { emits },
}) {
  if (!dataStateIds.length) return

  const subject = createBasicSubject(emits['component_service.cmd.data.start.v1']).forPublish()
    .env('prod')

  for (const stateId of dataStateIds) {
    await natsContext.publish(
      subject.build(),
      JSON.stringify({ data: { instanceId, stateId } })
    )
  }
}
