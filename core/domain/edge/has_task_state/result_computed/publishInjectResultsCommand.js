import { create as createBasicSubject } from '@liquid-bricks/lib-nats-subject/create/basic'

export async function publishInjectResultsCommand({
  scope: { instanceId, instanceVertexId, stateMachineId, stateEdgeId, result },
  rootCtx: { natsContext },
  routeCtx: { emits },
}) {
  const subject = createBasicSubject(emits['component_service.cmd.componentInstance.injectResults.v1'])
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
        type: 'task',
        result,
      },
    }),
  )
}
