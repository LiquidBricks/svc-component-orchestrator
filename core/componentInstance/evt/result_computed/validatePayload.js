import { Errors } from '../../../../errors.js'
import { STATE_EDGE_LABEL_BY_TYPE, STATE_EDGE_STATUS_BY_TYPE } from './constants.js'

export function validatePayload({ scope: { handlerDiagnostics, instanceId, type, name } }) {
  handlerDiagnostics.require(
    typeof instanceId === 'string' && instanceId.length,
    Errors.PRECONDITION_REQUIRED,
    'instanceId required',
    { field: 'instanceId' }
  )
  handlerDiagnostics.require(
    typeof type === 'string' && type.length,
    Errors.PRECONDITION_REQUIRED,
    'type required for result_computed',
    { field: 'type' }
  )
  const allowedTypes = ['data', 'task', 'gate']
  handlerDiagnostics.require(
    allowedTypes.includes(type),
    Errors.PRECONDITION_INVALID,
    `unknown type ${type} for result_computed`,
    { field: 'type', type }
  )
  handlerDiagnostics.require(
    typeof name === 'string' && name.length,
    Errors.PRECONDITION_REQUIRED,
    'name required for result_computed',
    { field: 'name' }
  )

  return {
    stateEdgeLabel: STATE_EDGE_LABEL_BY_TYPE[type],
    stateEdgeStatus: STATE_EDGE_STATUS_BY_TYPE[type],
  }
}
