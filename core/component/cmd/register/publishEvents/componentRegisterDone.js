import { create as createBasicSubject } from '@liquid-bricks/lib-nats-subject/create/basic'

export async function componentRegisterDone({ scope: { component: { hash } }, rootCtx: { natsContext } }) {
  const subject = createBasicSubject()
    .env('prod')
    .ns('component-service')
    .entity('component')
    .channel('evt')
    .action('registerDone')
    .version('v1')

  await natsContext.publish(
    subject.build(),
    JSON.stringify({
      data: { hash },
    })
  )
}
