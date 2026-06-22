import { Errors } from '../../../../../errors.js'
import { TASK_STATE_EDGE_LABEL, TASK_STATE_EDGE_STATUS } from './constants.js'

export async function findStateEdge({ scope: { handlerDiagnostics, stateMachineId, name, instanceId }, rootCtx: { g, dataMapper } }) {
  const [stateEdgeId] = await dataMapper.query.findTaskStateEdgeIdByName({ edgeLabel: TASK_STATE_EDGE_LABEL, vertexId: stateMachineId, name })
  handlerDiagnostics.require(
    stateEdgeId,
    Errors.PRECONDITION_INVALID,
    `task state ${name} not associated with instance ${instanceId}`,
    { instanceId, name }
  )

  return {
    stateEdgeId,
    stateEdgeStatus: TASK_STATE_EDGE_STATUS,
  }
}
