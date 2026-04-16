import { deserializeRegistration } from '@liquid-bricks/lib-component-builder'
import { Errors } from '../../../../errors.js'

export function validatePayload(args) {
  const { handlerDiagnostics, component } = args.scope

  try {
    const parsedComponent = deserializeRegistration(component)
    return { component: parsedComponent }
  } catch (error) {
    handlerDiagnostics.require(
      false,
      Errors.PRECONDITION_INVALID,
      error?.message ?? 'Invalid component registration payload',
      { component: component?.name, hash: component?.hash },
    )
  }
}
