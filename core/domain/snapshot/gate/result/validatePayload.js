import { Errors } from '../../../../../errors.js'
import { validateResultPayload } from '../../_shared/validateResultPayload.js'

export function validatePayload(args) {
  const result = validateResultPayload(args, { type: 'gate' })
  const { gateInstanceRefId, handlerDiagnostics } = args.scope

  handlerDiagnostics.require(
    typeof gateInstanceRefId === 'string' && gateInstanceRefId.length > 0,
    Errors.PRECONDITION_REQUIRED,
    'gateInstanceRefId required for gate snapshot result',
    { field: 'gateInstanceRefId', type: 'gate' },
  )

  return result
}
