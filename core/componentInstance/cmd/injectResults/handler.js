import { create as createSubject } from '@liquid-bricks/lib-nats-subject/create/basic'

export async function handler({
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
  await natsContext.publish(
    createSubject(emits['domain.edge.injects_into.injected.v1'])
      .forPublish()
      .env('prod')
      .build(),
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

  return { updatedAt }
}
