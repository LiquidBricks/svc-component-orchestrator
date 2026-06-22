import { DATA_STATE_EDGE_LABEL, DATA_STATE_EDGE_STATUS } from './constants.js'

export async function findStateEdge({ scope: { handlerDiagnostics, stateMachineId, name, instanceId }, rootCtx: { g, dataMapper } }) {
  const [stateEdgeId] = await dataMapper.query.findDataStateEdgeIdByName({ vertexId: stateMachineId, name })
  handlerDiagnostics.require(
    stateEdgeId,
    Errors.PRECONDITION_INVALID,
    `data state ${name} not associated with instance ${instanceId}`,
    { instanceId, name }
  )

  return {
    stateEdgeId,
    stateEdgeStatus: DATA_STATE_EDGE_STATUS,
  }
}
