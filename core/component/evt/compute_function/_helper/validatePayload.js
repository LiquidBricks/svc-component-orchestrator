import { PRECONDITION_INVALID, PRECONDITION_REQUIRED } from '@liquid-bricks/lib-diagnostics/codes'

const hasOwn = (value, key) => Object.prototype.hasOwnProperty.call(value, key)

export function validatePayload({ scope }) {
  const { handlerDiagnostics, instanceId, name } = scope
  handlerDiagnostics.require(
    typeof instanceId === 'string' && instanceId.length,
    PRECONDITION_REQUIRED,
    'instanceId required',
    { field: 'instanceId' }
  )
  handlerDiagnostics.require(
    typeof name === 'string' && name.length,
    PRECONDITION_REQUIRED,
    'name required for compute_function',
    { field: 'name' }
  )
  handlerDiagnostics.require(
    scope.status !== undefined,
    PRECONDITION_REQUIRED,
    'status required for compute_function',
    { field: 'status' },
  )
  handlerDiagnostics.require(
    scope.status === 'provided',
    PRECONDITION_INVALID,
    'status must be provided for compute_function',
    { field: 'status', status: scope.status },
  )
  handlerDiagnostics.require(
    scope.stateEdgeStatus === undefined || scope.stateEdgeStatus === 'provided',
    PRECONDITION_INVALID,
    'stateEdgeStatus must be provided for compute_function',
    { field: 'stateEdgeStatus', status: scope.status, stateEdgeStatus: scope.stateEdgeStatus },
  )
  handlerDiagnostics.require(
    hasOwn(scope, 'result'),
    PRECONDITION_REQUIRED,
    'result required for compute_function',
    { field: 'result', status: scope.status },
  )
  handlerDiagnostics.require(
    !hasOwn(scope, 'error'),
    PRECONDITION_INVALID,
    'error must be absent for compute_function',
    { field: 'error', error: scope.error },
  )

  return {
    result: scope.result,
    status: 'provided',
    stateEdgeStatus: 'provided',
  }
}
