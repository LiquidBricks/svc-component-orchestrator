import { validateComputationFailedPayload } from '../../_shared/validateComputationFailedPayload.js'

export function validatePayload(args) {
  return validateComputationFailedPayload(args, { type: 'data' })
}
