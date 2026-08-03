import { PRECONDITION_INVALID, PRECONDITION_REQUIRED } from '@liquid-bricks/lib-diagnostics/codes'

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

export function validatePayload({ scope }) {
  const { handlerDiagnostics, instanceId, name, status, stateEdgeStatus, error } = scope

  handlerDiagnostics.require(
    typeof instanceId === 'string' && instanceId.length,
    PRECONDITION_REQUIRED,
    'instanceId required for compute_function_failed',
    { field: 'instanceId' },
  )
  handlerDiagnostics.require(
    typeof name === 'string' && name.length,
    PRECONDITION_REQUIRED,
    'name required for compute_function_failed',
    { field: 'name' },
  )
  handlerDiagnostics.require(
    status !== undefined,
    PRECONDITION_REQUIRED,
    'status required for compute_function_failed',
    { field: 'status' },
  )
  handlerDiagnostics.require(
    status === 'error',
    PRECONDITION_INVALID,
    'status must be error for compute_function_failed',
    { field: 'status', status },
  )
  handlerDiagnostics.require(
    stateEdgeStatus === undefined || stateEdgeStatus === 'error',
    PRECONDITION_INVALID,
    'stateEdgeStatus must be error for compute_function_failed',
    { field: 'stateEdgeStatus', stateEdgeStatus },
  )
  handlerDiagnostics.require(
    !hasOwn(scope, 'result'),
    PRECONDITION_INVALID,
    'result must be absent for compute_function_failed',
    { field: 'result', result: scope.result },
  )
  handlerDiagnostics.require(
    !hasOwn(scope, 'resultValue'),
    PRECONDITION_INVALID,
    'resultValue must be absent for compute_function_failed',
    { field: 'resultValue', resultValue: scope.resultValue },
  )
  handlerDiagnostics.require(
    isStructuredError(error),
    PRECONDITION_INVALID,
    'structured error required for compute_function_failed',
    { field: 'error', error },
  )

  return {
    status: 'error',
    stateEdgeStatus: 'error',
    error,
  }
}
