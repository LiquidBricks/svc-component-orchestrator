import { create as createBasicSubject } from '@liquid-bricks/shared-providers/subject/create/basic'

export async function executionRequest({ scope: { instanceId, componentHash, name, deps }, rootCtx: { natsContext } }) {
  const subject = createBasicSubject()
    .env('prod')
    .ns('component-service')
    .entity('component')
    .channel('exec')
    .action('compute_result')
    .version('v1')

  await natsContext.publish(
    subject.build(),
    JSON.stringify({ data: { instanceId, deps, componentHash, name, type: 'data' } })
  )
}
