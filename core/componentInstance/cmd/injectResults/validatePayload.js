import { PRECONDITION_INVALID, PRECONDITION_REQUIRED } from '@liquid-bricks/lib-diagnostics/codes'
import { isIsoDateTime } from '../../../domain/_helper/isIsoDateTime.js'

export function validatePayload({ scope }) {
  const {
    handlerDiagnostics,
    instanceId,
    instanceVertexId,
    stateMachineId,
    stateEdgeId,
    type,
    updatedAt,
  } = scope
  handlerDiagnostics.require(
    typeof instanceId === 'string' && instanceId.length,
    PRECONDITION_REQUIRED,
    'instanceId required for injectResults',
    { field: 'instanceId' },
  )
  handlerDiagnostics.require(
    typeof instanceVertexId === 'string' && instanceVertexId.length,
    PRECONDITION_REQUIRED,
    'instanceVertexId required for injectResults',
    { field: 'instanceVertexId' },
  )
  handlerDiagnostics.require(
    typeof stateMachineId === 'string' && stateMachineId.length,
    PRECONDITION_REQUIRED,
    'stateMachineId required for injectResults',
    { field: 'stateMachineId' },
  )
  handlerDiagnostics.require(
    typeof stateEdgeId === 'string' && stateEdgeId.length,
    PRECONDITION_REQUIRED,
    'stateEdgeId required for injectResults',
    { field: 'stateEdgeId' },
  )
  handlerDiagnostics.require(
    type === 'data' || type === 'task',
    PRECONDITION_INVALID,
    'type must be data or task for injectResults',
    { field: 'type', type },
  )
  handlerDiagnostics.require(
    Object.prototype.hasOwnProperty.call(scope, 'result'),
    PRECONDITION_REQUIRED,
    'result required for injectResults',
    { field: 'result' },
  )
  handlerDiagnostics.require(
    typeof updatedAt === 'string' && updatedAt.length,
    PRECONDITION_REQUIRED,
    'updatedAt required for injectResults',
    { field: 'updatedAt' },
  )
  handlerDiagnostics.require(
    isIsoDateTime(updatedAt),
    PRECONDITION_INVALID,
    'updatedAt must be an ISO date-time for injectResults',
    { field: 'updatedAt' },
  )
}
