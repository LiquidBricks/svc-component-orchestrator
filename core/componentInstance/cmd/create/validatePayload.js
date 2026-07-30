import { PRECONDITION_REQUIRED } from '@liquid-bricks/lib-diagnostics/codes'

export function validatePayload({ scope: { handlerDiagnostics, componentHash, instanceId } }) {
  handlerDiagnostics.require(
    typeof componentHash === 'string' && componentHash.length,
    PRECONDITION_REQUIRED,
    'componentHash required for create',
    { field: 'componentHash' }
  )
  handlerDiagnostics.require(
    typeof instanceId === 'string' && instanceId.length,
    PRECONDITION_REQUIRED,
    'instanceId required',
    { field: 'instanceId' }
  )
}
