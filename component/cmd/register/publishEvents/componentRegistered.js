import { create as createBasicSubject } from '@liquid-bricks/shared-providers/subject/create/basic'

export async function componentRegistered({ scope: { component: { hash } }, rootCtx: { natsContext } }) {
  const subject = createBasicSubject()
    .env('prod')
    .ns('component-service')
    .entity('component')
    .channel('evt')
    .action('registered')
    .version('v1')

  await natsContext.publish(
    subject.build(),
    JSON.stringify({
      data: { hash },
    })
  )
}
