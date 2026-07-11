import { create as createSubject } from '@liquid-bricks/lib-nats-subject/create/basic'

export async function publishResultComputedFact({
  scope: {
    instanceId,
    instanceVertexId,
    name,
    result,
    stateMachineId,
    stateEdgeId,
    stateEdgeStatus,
  },
  rootCtx: { natsContext },
  routeCtx: { emits },
}) {
  const updatedAt = new Date().toISOString()
  const resultValue = result != null ? JSON.stringify(result) : ''

  await natsContext.publish(
    createSubject(emits['domain.edge.has_data_state.result_computed.v1'])
      .forPublish()
      .env('prod')
      .build(),
    JSON.stringify({
      data: {
        instanceId,
        instanceVertexId,
        stateMachineId,
        stateEdgeId,
        stateId: stateEdgeId,
        type: 'data',
        name,
        result,
        resultValue,
        status: stateEdgeStatus,
        stateEdgeStatus,
        updatedAt,
      },
    }),
  )

  return { instanceId, stateEdgeId, status: stateEdgeStatus, updatedAt }
}
