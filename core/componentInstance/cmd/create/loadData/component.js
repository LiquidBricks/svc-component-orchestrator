import { Errors } from '../../../../../errors.js'
import { domain } from '@liquid-bricks/spec-domain/domain'

export async function component({ rootCtx: { g, dataMapper }, scope: { handlerDiagnostics, componentHash } }) {
  const [componentId] = await dataMapper.query.findComponentIdByHash({ hash: componentHash })

  handlerDiagnostics.require(
    componentId,
    Errors.PRECONDITION_INVALID,
    `component not found for componentHash ${componentHash}`,
    { field: 'componentHash', componentHash }
  )

  return { componentId }
}
