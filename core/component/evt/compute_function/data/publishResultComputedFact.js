import { createResultComputedSubject } from '../../../../domain/edge/has_data_state/result_computed/subject.js'

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
}) {
  const updatedAt = new Date().toISOString()
  const resultValue = result != null ? JSON.stringify(result) : ''

  await natsContext.publish(
    createResultComputedSubject(),
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
