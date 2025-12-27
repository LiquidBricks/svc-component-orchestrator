import { create as createBasicSubject } from '@liquid-bricks/shared-providers/subject/create/basic'

export async function componentInstanceStarted({ scope: { instanceId }, rootCtx: { natsContext } }) {
  const subject = createBasicSubject()
    .env('prod')
    .ns('component-service')
    .entity('componentInstance')
    .channel('evt')
    .action('started')
    .version('v1')

  await natsContext.publish(
    subject.build(),
    JSON.stringify({ data: { instanceId } })
  )
}
