import { Errors } from '../../../../../errors.js'

export async function providedStateEdge({ scope: { handlerDiagnostics, stateMachineId, stateEdgeLabel, stateEdgeId, instanceId, type }, rootCtx: { g } }) {
  const [providedNodeId] = await g
    .V(stateMachineId)
    .outE(stateEdgeLabel)
    .has('id', stateEdgeId)
    .inV()
    .id()

  handlerDiagnostics.require(
    providedNodeId,
    Errors.PRECONDITION_INVALID,
    `${type} state edge ${stateEdgeId} not associated with instance ${instanceId}`,
    { instanceId, stateEdgeId, type }
  )

  return { providedNodeId }
}
