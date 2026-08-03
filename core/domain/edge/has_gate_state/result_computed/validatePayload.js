import { PRECONDITION_INVALID, PRECONDITION_REQUIRED } from '@liquid-bricks/lib-diagnostics/codes'
import { isIsoDateTime } from '../../../_helper/isIsoDateTime.js'

const hasOwn = (value, key) => Object.prototype.hasOwnProperty.call(value, key)

export function validatePayload({ scope }) {
  const {
    handlerDiagnostics,
    instanceId,
    instanceVertexId,
    stateMachineId,
    stateEdgeId,
    gateInstanceRefId,
    name,
    result,
    resultValue,
    status,
    stateEdgeStatus,
    error,
    updatedAt,
  } = scope
  handlerDiagnostics.require(
    typeof instanceId === 'string' && instanceId.length,
    PRECONDITION_REQUIRED,
    'instanceId required for has_gate_state result_computed',
    { field: 'instanceId' },
  )
  handlerDiagnostics.require(
    typeof instanceVertexId === 'string' && instanceVertexId.length,
    PRECONDITION_REQUIRED,
    'instanceVertexId required for has_gate_state result_computed',
    { field: 'instanceVertexId' },
  )
  handlerDiagnostics.require(
    typeof stateMachineId === 'string' && stateMachineId.length,
    PRECONDITION_REQUIRED,
    'stateMachineId required for has_gate_state result_computed',
    { field: 'stateMachineId' },
  )
  handlerDiagnostics.require(
    typeof stateEdgeId === 'string' && stateEdgeId.length,
    PRECONDITION_REQUIRED,
    'stateEdgeId required for has_gate_state result_computed',
    { field: 'stateEdgeId' },
  )
  handlerDiagnostics.require(
    typeof gateInstanceRefId === 'string' && gateInstanceRefId.length,
    PRECONDITION_REQUIRED,
    'gateInstanceRefId required for has_gate_state result_computed',
    { field: 'gateInstanceRefId' },
  )
  handlerDiagnostics.require(
    typeof name === 'string' && name.length,
    PRECONDITION_REQUIRED,
    'name required for has_gate_state result_computed',
    { field: 'name' },
  )
  handlerDiagnostics.require(
    scope.type === 'gate',
    PRECONDITION_INVALID,
    'type must be gate for has_gate_state result_computed',
    { field: 'type', type: scope.type },
  )
  handlerDiagnostics.require(
    status !== undefined,
    PRECONDITION_REQUIRED,
    'status required for has_gate_state result_computed',
    { field: 'status' },
  )
  handlerDiagnostics.require(
    stateEdgeStatus !== undefined,
    PRECONDITION_REQUIRED,
    'stateEdgeStatus required for has_gate_state result_computed',
    { field: 'stateEdgeStatus' },
  )
  handlerDiagnostics.require(
    status === 'provided' && stateEdgeStatus === 'provided',
    PRECONDITION_INVALID,
    'status and stateEdgeStatus must be provided for has_gate_state result_computed',
    { field: 'status', status, stateEdgeStatus },
  )
  handlerDiagnostics.require(
    hasOwn(scope, 'result'),
    PRECONDITION_REQUIRED,
    'result required for has_gate_state result_computed',
    { field: 'result', status },
  )
  handlerDiagnostics.require(
    resultValue === undefined || typeof resultValue === 'string',
    PRECONDITION_INVALID,
    'resultValue must be a string for has_gate_state result_computed',
    { field: 'resultValue', resultValue },
  )
  handlerDiagnostics.require(
    !hasOwn(scope, 'error'),
    PRECONDITION_INVALID,
    'error must be absent for has_gate_state result_computed',
    { field: 'error', error },
  )
  handlerDiagnostics.require(
    isIsoDateTime(updatedAt),
    PRECONDITION_INVALID,
    'updatedAt must be an ISO date-time for has_gate_state result_computed',
    { field: 'updatedAt', updatedAt },
  )

  return {
    resultValue: typeof resultValue === 'string'
      ? resultValue
      : (result != null ? JSON.stringify(result) : ''),
    status: 'provided',
    stateEdgeStatus: 'provided',
    type: 'gate',
  }
}
