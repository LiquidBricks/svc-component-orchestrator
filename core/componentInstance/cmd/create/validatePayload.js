import { Errors } from '../../../../errors.js'

export function validatePayload({ scope: { handlerDiagnostics, componentHash, instanceId } }) {
  handlerDiagnostics.require(
    typeof componentHash === 'string' && componentHash.length,
    Errors.PRECONDITION_REQUIRED,
    'componentHash required for create',
    { field: 'componentHash' }
  )
  handlerDiagnostics.require(
    typeof instanceId === 'string' && instanceId.length,
    Errors.PRECONDITION_REQUIRED,
    'instanceId required',
    { field: 'instanceId' }
  )
}
