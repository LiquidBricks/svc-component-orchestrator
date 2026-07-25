import { create as createSubject } from '@liquid-bricks/lib-nats-subject/create/basic'

export async function publishInjectResultsCommand({
  scope: {
    instanceId,
    instanceVertexId,
    stateMachineId,
    stateEdgeId,
    type,
    result,
    updatedAt,
  },
  rootCtx: { natsContext },
  routeCtx: { emits },
}) {
  const subject = createSubject(emits['component_service.cmd.componentInstance.injectResults.v1'])
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
        updatedAt,
      },
    }),
  )
}
