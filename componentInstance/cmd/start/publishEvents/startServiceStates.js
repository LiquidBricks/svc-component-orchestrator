import { create as createBasicSubject } from '@liquid-bricks/shared-providers/subject/create/basic'

export async function startServiceStates({ scope: { instanceId, serviceStateIds = [] }, rootCtx: { natsContext } }) {
  if (!serviceStateIds.length) return

  const subject = createBasicSubject()
    .env('prod')
    .ns('component-service')
    .entity('service')
    .channel('cmd')
    .action('start')
    .version('v1')

  for (const stateId of serviceStateIds) {
    await natsContext.publish(
      subject.build(),
      JSON.stringify({ data: { instanceId, stateId } })
    )
  }
}
