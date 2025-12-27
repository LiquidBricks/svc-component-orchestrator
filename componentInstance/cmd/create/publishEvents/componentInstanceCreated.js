import { create as createBasicSubject } from '@liquid-bricks/shared-providers/subject/create/basic'

export async function componentInstanceCreated({ scope: { instanceId, componentHash }, rootCtx: { natsContext } }) {
  const subject = createBasicSubject()
    .env('prod')
    .ns('component-service')
    .entity('componentInstance')
    .channel('evt')
    .action('created')
    .version('v1')

  await natsContext.publish(
    subject.build(),
    JSON.stringify({ data: { instanceId, componentHash } })
  )
}
