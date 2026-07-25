import { validateResultPayload } from '../../_shared/validateResultPayload.js'

export function validatePayload(args) {
  return validateResultPayload(args, { type: 'data' })
}
