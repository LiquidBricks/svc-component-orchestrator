import { create as createBasicSubject } from '@liquid-bricks/shared-providers/subject/create/basic'

export async function publishStartDependantsCommand({ scope: { instanceId, stateEdgeId, type }, rootCtx: { natsContext } }) {
  const subject = createBasicSubject()
    .env('prod')
    .ns('component-service')
    .entity('componentInstance')
    .channel('cmd')
    .action('start_dependants')
    .version('v1')

  await natsContext.publish(
    subject.build(),
    JSON.stringify({ data: { instanceId, stateEdgeId, type } })
  )
}
