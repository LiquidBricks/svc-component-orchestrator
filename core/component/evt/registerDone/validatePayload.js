import { PRECONDITION_REQUIRED } from '@liquid-bricks/lib-diagnostics/codes'

export function validatePayload({ scope: { handlerDiagnostics, hash } }) {
  handlerDiagnostics.require(
    hash,
    PRECONDITION_REQUIRED,
    'Component hash is required',
    { field: 'hash' }
  )
}
