import { deserializeRegistration } from '@liquid-bricks/lib-component-builder'
import { PRECONDITION_INVALID, PRECONDITION_REQUIRED } from '@liquid-bricks/lib-diagnostics/codes'

export function validatePayload(args) {
  const { handlerDiagnostics, component, agentID } = args.scope

  handlerDiagnostics.require(
    typeof agentID === 'string' && agentID.length,
    PRECONDITION_REQUIRED,
    'agentID is required',
    { field: 'agentID', component: component?.name, hash: component?.hash },
  )

  try {
    const parsedComponent = deserializeRegistration(component)
    return { component: parsedComponent }
  } catch (error) {
    handlerDiagnostics.require(
      false,
      PRECONDITION_INVALID,
      error?.message ?? 'Invalid component registration payload',
      { component: component?.name, hash: component?.hash },
    )
  }
}
