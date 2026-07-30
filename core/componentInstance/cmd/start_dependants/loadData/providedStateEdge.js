import { PRECONDITION_INVALID } from '@liquid-bricks/lib-diagnostics/codes'

export async function providedStateEdge({ scope: { handlerDiagnostics, stateMachineId, stateEdgeId, instanceId, type }, rootCtx: { g, dataMapper } }) {
  const [providedNodeId] = type === 'task'
    ? await dataMapper.query.findTaskStateEdgeTargetNodeId({ id: stateEdgeId, vertexId: stateMachineId })
    : await dataMapper.query.findDataStateEdgeTargetNodeId({ id: stateEdgeId, vertexId: stateMachineId })

  handlerDiagnostics.require(
    providedNodeId,
    PRECONDITION_INVALID,
    `${type} state edge ${stateEdgeId} not associated with instance ${instanceId}`,
    { instanceId, stateEdgeId, type }
  )

  return { providedNodeId }
}
