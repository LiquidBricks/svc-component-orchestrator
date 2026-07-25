import { Errors } from '../../../../../errors.js'

export function validatePayload({ scope }) {
  const { handlerDiagnostics, instanceId, name } = scope
  handlerDiagnostics.require(
    typeof instanceId === 'string' && instanceId.length,
    Errors.PRECONDITION_REQUIRED,
    'instanceId required',
    { field: 'instanceId' }
  )
  handlerDiagnostics.require(
    typeof name === 'string' && name.length,
    Errors.PRECONDITION_REQUIRED,
    'name required for compute_function',
    { field: 'name' }
  )
  handlerDiagnostics.require(
    Object.prototype.hasOwnProperty.call(scope, 'result'),
    Errors.PRECONDITION_REQUIRED,
    'result required for compute_function',
    { field: 'result' },
  )
}
