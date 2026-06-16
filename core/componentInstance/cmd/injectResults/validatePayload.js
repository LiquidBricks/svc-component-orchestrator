import { Errors } from '../../../../errors.js'
import { STATE_EDGE_LABEL_BY_TYPE } from '../../evt/computeResultDone/constants.js'

export function validatePayload({
  scope: { handlerDiagnostics, instanceId, instanceVertexId, stateMachineId, stateEdgeId, type },
}) {
  handlerDiagnostics.require(
    typeof instanceId === 'string' && instanceId.length,
    Errors.PRECONDITION_REQUIRED,
    'instanceId required for injectResults',
    { field: 'instanceId' },
  )
  handlerDiagnostics.require(
    typeof instanceVertexId === 'string' && instanceVertexId.length,
    Errors.PRECONDITION_REQUIRED,
    'instanceVertexId required for injectResults',
    { field: 'instanceVertexId' },
  )
  handlerDiagnostics.require(
    typeof stateMachineId === 'string' && stateMachineId.length,
    Errors.PRECONDITION_REQUIRED,
    'stateMachineId required for injectResults',
    { field: 'stateMachineId' },
  )
  handlerDiagnostics.require(
    typeof stateEdgeId === 'string' && stateEdgeId.length,
    Errors.PRECONDITION_REQUIRED,
    'stateEdgeId required for injectResults',
    { field: 'stateEdgeId' },
  )
  handlerDiagnostics.require(
    type === 'data' || type === 'task',
    Errors.PRECONDITION_INVALID,
    'type must be data or task for injectResults',
    { field: 'type', type },
  )

  return {
    stateEdgeLabel: STATE_EDGE_LABEL_BY_TYPE[type],
  }
}
