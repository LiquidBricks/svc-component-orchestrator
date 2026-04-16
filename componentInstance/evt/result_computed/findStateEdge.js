import { Errors } from '../../../errors.js'

export async function findStateEdge({ scope: { handlerDiagnostics, stateMachineId, stateEdgeLabel, name, instanceId, type }, rootCtx: { g } }) {
  if (type === 'gate') return {}

  const [stateEdgeId] = await g
    .V(stateMachineId)
    .outE(stateEdgeLabel)
    .filter(_ => _.inV().has('name', name))
    .id()
  handlerDiagnostics.require(
    stateEdgeId,
    Errors.PRECONDITION_INVALID,
    `${type} state ${name} not associated with instance ${instanceId}`,
    { instanceId, type, name }
  )

  return { stateEdgeId }
}
