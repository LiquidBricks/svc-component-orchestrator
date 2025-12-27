import { create as createBasicSubject } from '@liquid-bricks/shared-providers/subject/create/basic'

export async function publishExecutionRequest({ scope: { instanceId, componentHash, name, deps }, rootCtx: { natsContext } }) {
  const execSubject = createBasicSubject()
    .env('prod')
    .ns('component-service')
    .entity('component')
    .channel('exec')
    .action('compute_result')
    .version('v1')

  await natsContext.publish(
    execSubject.build(),
    JSON.stringify({ data: { instanceId, deps, componentHash, name, type: 'task' } })
  )
}
