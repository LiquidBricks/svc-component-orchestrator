import { Errors } from '../../../../../errors.js'

export function validatePayload({
  scope: {
    handlerDiagnostics,
    instanceId,
    instanceVertexId,
    stateMachineId,
    gateInstanceRefId,
    name,
    result,
    resultValue,
  },
}) {
  handlerDiagnostics.require(
    typeof instanceId === 'string' && instanceId.length,
    Errors.PRECONDITION_REQUIRED,
    'instanceId required for gate result_computed',
    { field: 'instanceId' },
  )
  handlerDiagnostics.require(
    typeof instanceVertexId === 'string' && instanceVertexId.length,
    Errors.PRECONDITION_REQUIRED,
    'instanceVertexId required for gate result_computed',
    { field: 'instanceVertexId' },
  )
  handlerDiagnostics.require(
    typeof stateMachineId === 'string' && stateMachineId.length,
    Errors.PRECONDITION_REQUIRED,
    'stateMachineId required for gate result_computed',
    { field: 'stateMachineId' },
  )
  handlerDiagnostics.require(
    typeof gateInstanceRefId === 'string' && gateInstanceRefId.length,
    Errors.PRECONDITION_REQUIRED,
    'gateInstanceRefId required for gate result_computed',
    { field: 'gateInstanceRefId' },
  )
  handlerDiagnostics.require(
    typeof name === 'string' && name.length,
    Errors.PRECONDITION_REQUIRED,
    'name required for gate result_computed',
    { field: 'name' },
  )

  const normalizedResultValue = typeof resultValue === 'string'
    ? resultValue
    : (result != null ? JSON.stringify(result) : '')

  return {
    resultValue: normalizedResultValue,
    type: 'gate',
  }
}
