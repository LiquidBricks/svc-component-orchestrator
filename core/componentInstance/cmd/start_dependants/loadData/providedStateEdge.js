import { Errors } from '../../../../../errors.js'

export async function providedStateEdge({ scope: { handlerDiagnostics, stateMachineId, stateEdgeLabel, stateEdgeId, instanceId, type }, rootCtx: { g, dataMapper } }) {
  const [providedNodeId] = await dataMapper.query.findStateEdgeTargetNodeId({ id: stateEdgeId, edgeLabel: stateEdgeLabel, vertexId: stateMachineId })

  handlerDiagnostics.require(
    providedNodeId,
    Errors.PRECONDITION_INVALID,
    `${type} state edge ${stateEdgeId} not associated with instance ${instanceId}`,
    { instanceId, stateEdgeId, type }
  )

  return { providedNodeId }
}
