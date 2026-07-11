import { create as createBasicSubject } from '@liquid-bricks/lib-nats-subject/create/basic'

export async function componentInstanceStartDone({
  scope: { instanceId },
  rootCtx: { natsContext },
  routeCtx: { emits },
}) {
  const subject = createBasicSubject(emits['component_service.evt.componentInstance.startDone.v1']).forPublish()
    .env('prod')

  await natsContext.publish(
    subject.build(),
    JSON.stringify({ data: { instanceId } })
  )
}
