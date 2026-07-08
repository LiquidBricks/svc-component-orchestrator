import { Errors } from '../../../../../errors.js'

export function validatePayload({
  scope: {
    handlerDiagnostics,
    instanceId,
    instanceVertexId,
    stateMachineId,
    stateEdgeId,
    status,
    stateEdgeStatus,
  },
}) {
  handlerDiagnostics.require(
    typeof instanceId === 'string' && instanceId.length,
    Errors.PRECONDITION_REQUIRED,
    'instanceId required for data result_computed',
    { field: 'instanceId' },
  )
  handlerDiagnostics.require(
    typeof instanceVertexId === 'string' && instanceVertexId.length,
    Errors.PRECONDITION_REQUIRED,
    'instanceVertexId required for data result_computed',
    { field: 'instanceVertexId' },
  )
  handlerDiagnostics.require(
    typeof stateMachineId === 'string' && stateMachineId.length,
    Errors.PRECONDITION_REQUIRED,
    'stateMachineId required for data result_computed',
    { field: 'stateMachineId' },
  )
  handlerDiagnostics.require(
    typeof stateEdgeId === 'string' && stateEdgeId.length,
    Errors.PRECONDITION_REQUIRED,
    'stateEdgeId required for data result_computed',
    { field: 'stateEdgeId' },
  )

  const normalizedStatus = stateEdgeStatus ?? status
  handlerDiagnostics.require(
    typeof normalizedStatus === 'string' && normalizedStatus.length,
    Errors.PRECONDITION_REQUIRED,
    'status required for data result_computed',
    { field: 'status' },
  )

  return {
    stateEdgeStatus: normalizedStatus,
    status: normalizedStatus,
    type: 'data',
  }
}
