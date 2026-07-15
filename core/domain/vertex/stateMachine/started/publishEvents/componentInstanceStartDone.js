import { create as createSubject } from '@liquid-bricks/lib-nats-subject/create/basic'

export async function componentInstanceStartDone({
  scope: { instanceId },
  rootCtx: { natsContext },
  routeCtx: { emits },
}) {
  await natsContext.publish(
    createSubject(emits['component_service.evt.componentInstance.startDone.v1'])
      .forPublish()
      .env('prod')
      .build(),
    JSON.stringify({ data: { instanceId } }),
  )
}
