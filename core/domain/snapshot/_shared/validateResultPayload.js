import { Errors } from '../../../../errors.js'
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
    updatedAt,
  } = scope

  for (const field of REQUIRED_STRING_FIELDS) {
    handlerDiagnostics.require(
      typeof scope[field] === 'string' && scope[field].length > 0,
      Errors.PRECONDITION_REQUIRED,
      `${field} required for ${type} snapshot result`,
      { field, type },
    )
  }

  handlerDiagnostics.require(
    scope.type === type,
    Errors.PRECONDITION_INVALID,
    `type must be ${type} for ${type} snapshot result`,
    { field: 'type', type: scope.type },
  )
  handlerDiagnostics.require(
    isIsoDateTime(updatedAt),
    Errors.PRECONDITION_INVALID,
    `updatedAt must be an ISO date-time for ${type} snapshot result`,
    { field: 'updatedAt', type },
  )
  handlerDiagnostics.require(
    delta != null && typeof delta === 'object' && !Array.isArray(delta),
    Errors.PRECONDITION_REQUIRED,
    `delta required for ${type} snapshot result`,
    { field: 'delta', type },
  )

  const deltaKey = `${type}.${name}`
  handlerDiagnostics.require(
    hasOwn(delta, deltaKey),
    Errors.PRECONDITION_REQUIRED,
    `${deltaKey} required in ${type} snapshot delta`,
    { field: 'delta', deltaKey, type },
  )

  return {
    type,
    result: delta[deltaKey],
  }
}
