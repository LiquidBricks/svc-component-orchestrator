import { Errors } from '../../../../../errors.js'

export async function findStateEdge({
  scope: { handlerDiagnostics, instanceVertexId, stateMachineId, name, instanceId },
  rootCtx: { dataMapper },
}) {
  const [gateInstanceRefId] = await dataMapper.query.findGateInstanceRefIdByAlias({
    vertexId: instanceVertexId,
    alias: name,
  })
  handlerDiagnostics.require(
    gateInstanceRefId,
    Errors.PRECONDITION_INVALID,
    `gate ${name} not associated with instance ${instanceId}`,
    { instanceId, name },
  )

  const [stateEdgeId] = await dataMapper.query.findGateStateEdgeIdForTargetNode({
    vertexId: stateMachineId,
    id: gateInstanceRefId,
  })
  handlerDiagnostics.require(
    stateEdgeId,
    Errors.PRECONDITION_INVALID,
    `gate state ${name} not associated with instance ${instanceId}`,
    { instanceId, name, gateInstanceRefId },
  )

  return { gateInstanceRefId, stateEdgeId }
}
