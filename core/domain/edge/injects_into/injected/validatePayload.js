import { PRECONDITION_INVALID, PRECONDITION_REQUIRED } from '@liquid-bricks/lib-diagnostics/codes'
import { isIsoDateTime } from '../../../_helper/isIsoDateTime.js'

const REQUIRED_FIELDS = [
  'instanceId',
  'instanceVertexId',
  'stateMachineId',
  'stateEdgeId',
  'updatedAt',
]

export function validatePayload({ scope }) {
  const { handlerDiagnostics, type, updatedAt } = scope

  for (const field of REQUIRED_FIELDS) {
    handlerDiagnostics.require(
      typeof scope[field] === 'string' && scope[field].length > 0,
      PRECONDITION_REQUIRED,
      `${field} required for injects_into injected`,
      { field },
    )
  }

  handlerDiagnostics.require(
    type === 'data' || type === 'task',
    PRECONDITION_INVALID,
    'type must be data or task for injects_into injected',
    { field: 'type', type },
  )
  handlerDiagnostics.require(
    Object.prototype.hasOwnProperty.call(scope, 'result'),
    PRECONDITION_REQUIRED,
    'result required for injects_into injected',
    { field: 'result' },
  )
  handlerDiagnostics.require(
    isIsoDateTime(updatedAt),
    PRECONDITION_INVALID,
    'updatedAt must be an ISO date-time for injects_into injected',
    { field: 'updatedAt' },
  )
}
