import { Errors } from '../../../../../errors.js'
import { domain } from '@liquid-bricks/spec-domain/domain'

export async function component({ rootCtx: { g }, scope: { handlerDiagnostics, componentHash } }) {
  const [componentId] = await g.V()
    .has('label', domain.vertex.component.constants.LABEL)
    .has('hash', componentHash)
    .id()

  handlerDiagnostics.require(
    componentId,
    Errors.PRECONDITION_INVALID,
    `component not found for componentHash ${componentHash}`,
    { field: 'componentHash', componentHash }
  )

  return { componentId }
}
