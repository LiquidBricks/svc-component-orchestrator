import { Errors } from '../../../../errors.js'

export function validatePayload({ scope: { handlerDiagnostics, hash } }) {
  handlerDiagnostics.require(
    hash,
    Errors.PRECONDITION_REQUIRED,
    'Component hash is required',
    { field: 'hash' }
  )
}
