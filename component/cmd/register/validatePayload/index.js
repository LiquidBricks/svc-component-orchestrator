import { ensureComponentIdentifiers } from './ensureComponentIdentifiers.js'

export function validatePayload(args) {
  ensureComponentIdentifiers(args)
}
