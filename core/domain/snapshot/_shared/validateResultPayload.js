import { PRECONDITION_INVALID, PRECONDITION_REQUIRED } from '@liquid-bricks/lib-diagnostics/codes'
import { isIsoDateTime } from '../../_helper/isIsoDateTime.js'

const hasOwn = (value, key) => Object.prototype.hasOwnProperty.call(value, key)

const REQUIRED_STRING_FIELDS = [
  'instanceId',
  'instanceVertexId',
  'componentStateId',
  'stateMachineId',
  'stateEdgeId',
  'name',
  'updatedAt',
]

export function validateResultPayload({ scope }, { type }) {
  const {
    handlerDiagnostics,
    delta,
    name,
    status,
    stateEdgeStatus,
    updatedAt,
  } = scope

  for (const field of REQUIRED_STRING_FIELDS) {
    handlerDiagnostics.require(
      typeof scope[field] === 'string' && scope[field].length > 0,
      PRECONDITION_REQUIRED,
      `${field} required for ${type} snapshot result`,
      { field, type },
    )
  }

  handlerDiagnostics.require(
    scope.type === type,
    PRECONDITION_INVALID,
    `type must be ${type} for ${type} snapshot result`,
    { field: 'type', type: scope.type },
  )
  handlerDiagnostics.require(
    isIsoDateTime(updatedAt),
    PRECONDITION_INVALID,
    `updatedAt must be an ISO date-time for ${type} snapshot result`,
    { field: 'updatedAt', type },
  )
  handlerDiagnostics.require(
    delta != null && typeof delta === 'object' && !Array.isArray(delta),
    PRECONDITION_REQUIRED,
    `delta required for ${type} snapshot result`,
    { field: 'delta', type },
  )
  handlerDiagnostics.require(
    status !== undefined,
    PRECONDITION_REQUIRED,
    `status required for ${type} snapshot result`,
    { field: 'status', type },
  )
  handlerDiagnostics.require(
    stateEdgeStatus !== undefined,
    PRECONDITION_REQUIRED,
    `stateEdgeStatus required for ${type} snapshot result`,
    { field: 'stateEdgeStatus', type },
  )
  handlerDiagnostics.require(
    status === 'provided' && stateEdgeStatus === 'provided',
    PRECONDITION_INVALID,
    `status and stateEdgeStatus must be provided for ${type} snapshot result`,
    { field: 'status', status, stateEdgeStatus, type },
  )

  const deltaKey = `${type}.${name}`
  const stateDeltaKey = `${deltaKey}.state`
  handlerDiagnostics.require(
    hasOwn(delta, deltaKey),
    PRECONDITION_REQUIRED,
    `${deltaKey} required in ${type} snapshot delta`,
    { field: 'delta', deltaKey, type },
  )
  handlerDiagnostics.require(
    hasOwn(delta, stateDeltaKey) && delta[stateDeltaKey] === 'provided',
    PRECONDITION_INVALID,
    `${stateDeltaKey} must be provided for ${type} snapshot result`,
    { field: 'delta', stateDeltaKey, type },
  )
  handlerDiagnostics.require(
    !hasOwn(scope, 'error'),
    PRECONDITION_INVALID,
    `error must be absent for ${type} snapshot result`,
    { field: 'error', error: scope.error, type },
  )

  return {
    type,
    result: delta[deltaKey],
    status: 'provided',
    stateEdgeStatus: 'provided',
  }
}
