import { Errors } from '../../../../errors.js'
import { STATE_EDGE_LABEL_BY_TYPE } from '../computeResultDone/constants.js'

export function validatePayload({
  scope: { handlerDiagnostics, instanceId, instanceVertexId, stateMachineId, stateEdgeId, type },
}) {
  handlerDiagnostics.require(
    typeof instanceId === 'string' && instanceId.length,
    Errors.PRECONDITION_REQUIRED,
    'instanceId required for processInjectedComputeResultDone',
    { field: 'instanceId' },
  )
  handlerDiagnostics.require(
    typeof instanceVertexId === 'string' && instanceVertexId.length,
    Errors.PRECONDITION_REQUIRED,
    'instanceVertexId required for processInjectedComputeResultDone',
    { field: 'instanceVertexId' },
  )
  handlerDiagnostics.require(
    typeof stateMachineId === 'string' && stateMachineId.length,
    Errors.PRECONDITION_REQUIRED,
    'stateMachineId required for processInjectedComputeResultDone',
    { field: 'stateMachineId' },
  )
  handlerDiagnostics.require(
    typeof stateEdgeId === 'string' && stateEdgeId.length,
    Errors.PRECONDITION_REQUIRED,
    'stateEdgeId required for processInjectedComputeResultDone',
    { field: 'stateEdgeId' },
  )
  handlerDiagnostics.require(
    type === 'data' || type === 'task',
    Errors.PRECONDITION_INVALID,
    'type must be data or task for processInjectedComputeResultDone',
    { field: 'type', type },
  )

  return {
    stateEdgeLabel: STATE_EDGE_LABEL_BY_TYPE[type],
  }
}
