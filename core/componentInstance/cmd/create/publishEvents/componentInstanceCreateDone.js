import { create as createBasicSubject } from '@liquid-bricks/lib-nats-subject/create/basic'

export async function componentInstanceCreateDone({
  scope: { instanceId, componentHash },
  rootCtx: { natsContext },
  routeCtx: { emits },
}) {
  const subject = createBasicSubject(emits['component_service.evt.componentInstance.createDone.v1']).forPublish()
    .env('prod')

  await natsContext.publish(
    subject.build(),
    JSON.stringify({ data: { instanceId, componentHash } })
  )
}
