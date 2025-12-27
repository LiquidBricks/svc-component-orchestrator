import { create as createBasicSubject } from '@liquid-bricks/shared-providers/subject/create/basic'

export async function startTaskStates({ scope: { instanceId, taskStateIds = [] }, rootCtx: { natsContext } }) {
  if (!taskStateIds.length) return

  const subject = createBasicSubject()
    .env('prod')
    .ns('component-service')
    .entity('task')
    .channel('cmd')
    .action('start')
    .version('v1')

  for (const stateId of taskStateIds) {
    await natsContext.publish(
      subject.build(),
      JSON.stringify({ data: { instanceId, stateId } })
    )
  }
}
