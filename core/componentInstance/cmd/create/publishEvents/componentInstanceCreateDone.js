import { create as createBasicSubject } from '@liquid-bricks/lib-nats-subject/create/basic'

export async function componentInstanceCreateDone({ scope: { instanceId, componentHash }, rootCtx: { natsContext } }) {
  const subject = createBasicSubject()
    .env('prod')
    .ns('component-service')
    .entity('componentInstance')
    .channel('evt')
    .action('createDone')
    .version('v1')

  await natsContext.publish(
    subject.build(),
    JSON.stringify({ data: { instanceId, componentHash } })
  )
}
