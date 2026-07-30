import { PRECONDITION_INVALID } from '@liquid-bricks/lib-diagnostics/codes'
import { TASK_STATE_EDGE_STATUS } from './constants.js'

export async function findStateEdge({ scope: { handlerDiagnostics, stateMachineId, name, instanceId }, rootCtx: { g, dataMapper } }) {
  const [stateEdgeId] = await dataMapper.query.findTaskStateEdgeIdByName({ vertexId: stateMachineId, name })
  handlerDiagnostics.require(
    stateEdgeId,
    PRECONDITION_INVALID,
    `task state ${name} not associated with instance ${instanceId}`,
    { instanceId, name }
  )

  return {
    stateEdgeId,
    stateEdgeStatus: TASK_STATE_EDGE_STATUS,
  }
}
