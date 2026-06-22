import { Errors } from '../../../../../errors.js'

export function validatePayload({ scope: { handlerDiagnostics, instanceId, name } }) {
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
}
