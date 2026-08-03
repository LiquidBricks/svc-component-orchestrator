import { PRECONDITION_INVALID, PRECONDITION_REQUIRED } from '@liquid-bricks/lib-diagnostics/codes'
import { isIsoDateTime } from '../../_helper/isIsoDateTime.js'

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
  'componentStateId',
  'stateMachineId',
  'stateEdgeId',
  'name',
  'updatedAt',
]

export function validateComputationFailedPayload({ scope }, { type }) {
  const {
    handlerDiagnostics,
    delta,
    name,
    status,
    stateEdgeStatus,
    error,
    updatedAt,
  } = scope

  for (const field of REQUIRED_STRING_FIELDS) {
    handlerDiagnostics.require(
      typeof scope[field] === 'string' && scope[field].length > 0,
      PRECONDITION_REQUIRED,
      `${field} required for ${type} snapshot computation_failed`,
      { field, type },
    )
  }

  handlerDiagnostics.require(
    scope.type === type,
    PRECONDITION_INVALID,
    `type must be ${type} for ${type} snapshot computation_failed`,
    { field: 'type', type: scope.type },
  )
  handlerDiagnostics.require(
    isIsoDateTime(updatedAt),
    PRECONDITION_INVALID,
    `updatedAt must be an ISO date-time for ${type} snapshot computation_failed`,
    { field: 'updatedAt', type },
  )
  handlerDiagnostics.require(
    delta != null && typeof delta === 'object' && !Array.isArray(delta),
    PRECONDITION_REQUIRED,
    `delta required for ${type} snapshot computation_failed`,
    { field: 'delta', type },
  )
  handlerDiagnostics.require(
    status !== undefined,
    PRECONDITION_REQUIRED,
    `status required for ${type} snapshot computation_failed`,
    { field: 'status', type },
  )
  handlerDiagnostics.require(
    stateEdgeStatus !== undefined,
    PRECONDITION_REQUIRED,
    `stateEdgeStatus required for ${type} snapshot computation_failed`,
    { field: 'stateEdgeStatus', type },
  )
  handlerDiagnostics.require(
    status === 'error' && stateEdgeStatus === 'error',
    PRECONDITION_INVALID,
    `status and stateEdgeStatus must be error for ${type} snapshot computation_failed`,
    { field: 'status', status, stateEdgeStatus, type },
  )

  const stateDeltaKey = `${type}.${name}.state`
  const deltaKeys = delta != null && typeof delta === 'object' && !Array.isArray(delta)
    ? Object.keys(delta)
    : []
  handlerDiagnostics.require(
    deltaKeys.length === 1 && deltaKeys[0] === stateDeltaKey && delta[stateDeltaKey] === 'error',
    PRECONDITION_INVALID,
    `${stateDeltaKey} must be the only delta field for ${type} snapshot computation_failed`,
    { field: 'delta', stateDeltaKey, deltaKeys, type },
  )
  handlerDiagnostics.require(
    !hasOwn(scope, 'result'),
    PRECONDITION_INVALID,
    `result must be absent for ${type} snapshot computation_failed`,
    { field: 'result', result: scope.result, type },
  )
  handlerDiagnostics.require(
    !hasOwn(scope, 'resultValue'),
    PRECONDITION_INVALID,
    `resultValue must be absent for ${type} snapshot computation_failed`,
    { field: 'resultValue', resultValue: scope.resultValue, type },
  )
  handlerDiagnostics.require(
    isStructuredError(error),
    PRECONDITION_INVALID,
    `structured error required for ${type} snapshot computation_failed`,
    { field: 'error', error, type },
  )

  return {
    type,
    status: 'error',
    stateEdgeStatus: 'error',
    error,
  }
}
