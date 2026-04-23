import { Errors } from '../../../../errors.js'
import { STATE_EDGE_LABEL_BY_TYPE } from './constants.js'

export function validatePayload({ scope: { handlerDiagnostics, instanceId, stateEdgeId, type } }) {
  handlerDiagnostics.require(
    typeof instanceId === 'string' && instanceId.length,
    Errors.PRECONDITION_REQUIRED,
    'instanceId required for start_dependants',
    { field: 'instanceId' }
  )
  handlerDiagnostics.require(
    typeof stateEdgeId === 'string' && stateEdgeId.length,
    Errors.PRECONDITION_REQUIRED,
    'stateEdgeId required for start_dependants',
    { field: 'stateEdgeId' }
  )
  handlerDiagnostics.require(
    typeof type === 'string' && ['data', 'task'].includes(type),
    Errors.PRECONDITION_INVALID,
    'type must be data or task for start_dependants',
    { field: 'type', type }
  )

  const stateEdgeLabel = STATE_EDGE_LABEL_BY_TYPE[type]

  return { stateEdgeLabel }
}
