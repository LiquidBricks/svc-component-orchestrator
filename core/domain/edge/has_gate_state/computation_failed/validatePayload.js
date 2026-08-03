import { PRECONDITION_INVALID, PRECONDITION_REQUIRED } from '@liquid-bricks/lib-diagnostics/codes'
import { isIsoDateTime } from '../../../_helper/isIsoDateTime.js'

const hasOwn = (value, key) => Object.prototype.hasOwnProperty.call(value, key)

function isStructuredError(error) {
  return error != null
    && typeof error === 'object'
    && !Array.isArray(error)
    && typeof error.name === 'string'
    && error.name.length > 0
    && typeof error.message === 'string'
    && (!hasOwn(error, 'code') || typeof error.code === 'string' || typeof error.code === 'number')
}

const REQUIRED_STRING_FIELDS = [
  'instanceId',
  'instanceVertexId',
  'stateMachineId',
  'stateEdgeId',
  'gateInstanceRefId',
  'name',
  'updatedAt',
]

export function validatePayload({ scope }) {
  const { handlerDiagnostics, status, stateEdgeStatus, error, updatedAt } = scope

  for (const field of REQUIRED_STRING_FIELDS) {
    handlerDiagnostics.require(
      typeof scope[field] === 'string' && scope[field].length > 0,
      PRECONDITION_REQUIRED,
      `${field} required for has_gate_state computation_failed`,
      { field },
    )
  }

  handlerDiagnostics.require(
    scope.type === 'gate',
    PRECONDITION_INVALID,
    'type must be gate for has_gate_state computation_failed',
    { field: 'type', type: scope.type },
  )
  handlerDiagnostics.require(
    status !== undefined,
    PRECONDITION_REQUIRED,
    'status required for has_gate_state computation_failed',
    { field: 'status' },
  )
  handlerDiagnostics.require(
    stateEdgeStatus !== undefined,
    PRECONDITION_REQUIRED,
    'stateEdgeStatus required for has_gate_state computation_failed',
    { field: 'stateEdgeStatus' },
  )
  handlerDiagnostics.require(
    status === 'error' && stateEdgeStatus === 'error',
    PRECONDITION_INVALID,
    'status and stateEdgeStatus must be error for has_gate_state computation_failed',
    { field: 'status', status, stateEdgeStatus },
  )
  handlerDiagnostics.require(
    !hasOwn(scope, 'result'),
    PRECONDITION_INVALID,
    'result must be absent for has_gate_state computation_failed',
    { field: 'result', result: scope.result },
  )
  handlerDiagnostics.require(
    !hasOwn(scope, 'resultValue'),
    PRECONDITION_INVALID,
    'resultValue must be absent for has_gate_state computation_failed',
    { field: 'resultValue', resultValue: scope.resultValue },
  )
  handlerDiagnostics.require(
    isStructuredError(error),
    PRECONDITION_INVALID,
    'structured error required for has_gate_state computation_failed',
    { field: 'error', error },
  )
  handlerDiagnostics.require(
    isIsoDateTime(updatedAt),
    PRECONDITION_INVALID,
    'updatedAt must be an ISO date-time for has_gate_state computation_failed',
    { field: 'updatedAt', updatedAt },
  )

  return {
    type: 'gate',
    status: 'error',
    stateEdgeStatus: 'error',
    error,
  }
}
