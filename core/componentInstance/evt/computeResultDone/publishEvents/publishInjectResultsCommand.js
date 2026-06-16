import { create as createBasicSubject } from '@liquid-bricks/lib-nats-subject/create/basic'
import { events as natsEvents } from '@liquid-bricks/lib-nats-subject/events/nats'

export async function publishInjectResultsCommand({
  scope: { instanceId, instanceVertexId, stateMachineId, stateEdgeId, type, result },
  rootCtx: { natsContext },
}) {
  if (type === 'gate') return

  const subject = createBasicSubject(natsEvents['*'].component_service['*']['*'].cmd.componentInstance.injectResults.v1['*'])
    .forPublish()
    .env('prod')
    .build()

  await natsContext.publish(
    subject,
    JSON.stringify({
      data: {
        instanceId,
        instanceVertexId,
        stateMachineId,
        stateEdgeId,
        type,
        result,
      },
    }),
  )
}
