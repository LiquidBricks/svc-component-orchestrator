import { create as createSubject } from '@liquid-bricks/lib-nats-subject/create/basic'

export async function publishResultComputedFact({
  scope: {
    instanceId,
    instanceVertexId,
    stateMachineId,
    stateEdgeId,
    gateInstanceRefId,
    name,
    result,
  },
  rootCtx: { natsContext },
  routeCtx: { emits },
}) {
  const updatedAt = new Date().toISOString()
  const resultValue = result != null ? JSON.stringify(result) : ''

  await natsContext.publish(
    createSubject(emits['domain.edge.has_gate_state.result_computed.v1'])
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
        gateInstanceRefId,
        type: 'gate',
        name,
        result,
        resultValue,
        status: 'provided',
        stateEdgeStatus: 'provided',
        updatedAt,
      },
    }),
  )

  return {
    instanceId,
    stateEdgeId,
    gateInstanceRefId,
    status: 'provided',
    stateEdgeStatus: 'provided',
    updatedAt,
  }
}
