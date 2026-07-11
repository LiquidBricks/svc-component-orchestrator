import { create as createBasicSubject } from '@liquid-bricks/lib-nats-subject/create/basic'

export async function componentRegisterDone({
  scope: { component: { hash } },
  rootCtx: { natsContext },
  routeCtx: { emits },
}) {
  const subject = createBasicSubject(emits['component_service.evt.component.registerDone.v1']).forPublish()
    .env('prod')

  await natsContext.publish(
    subject.build(),
    JSON.stringify({
      data: { hash },
    })
  )
}
