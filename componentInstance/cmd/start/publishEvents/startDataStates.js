import { create as createBasicSubject } from '@liquid-bricks/shared-providers/subject/create/basic'

export async function startDataStates({ scope: { instanceId, dataStateIds = [] }, rootCtx: { natsContext } }) {
  if (!dataStateIds.length) return

  const subject = createBasicSubject()
    .env('prod')
    .ns('component-service')
    .entity('data')
    .channel('cmd')
    .action('start')
    .version('v1')

  for (const stateId of dataStateIds) {
    await natsContext.publish(
      subject.build(),
      JSON.stringify({ data: { instanceId, stateId } })
    )
  }
}
