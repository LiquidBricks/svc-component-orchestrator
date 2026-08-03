import { PRECONDITION_REQUIRED } from '@liquid-bricks/lib-diagnostics/codes'
import { validateComputationFailedPayload } from '../../_shared/validateComputationFailedPayload.js'

export function validatePayload(args) {
  const result = validateComputationFailedPayload(args, { type: 'gate' })
  const { gateInstanceRefId, handlerDiagnostics } = args.scope

  handlerDiagnostics.require(
    typeof gateInstanceRefId === 'string' && gateInstanceRefId.length > 0,
    PRECONDITION_REQUIRED,
    'gateInstanceRefId required for gate snapshot computation_failed',
    { field: 'gateInstanceRefId', type: 'gate' },
  )

  return result
}
