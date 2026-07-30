import { PRECONDITION_INVALID } from '@liquid-bricks/lib-diagnostics/codes'
import { domain } from '@liquid-bricks/spec-domain/domain'

export async function component({ rootCtx: { g, dataMapper }, scope: { handlerDiagnostics, componentHash } }) {
  const [componentId] = await dataMapper.query.findComponentIdByHash({ hash: componentHash })

  handlerDiagnostics.require(
    componentId,
    PRECONDITION_INVALID,
    `component not found for componentHash ${componentHash}`,
    { field: 'componentHash', componentHash }
  )

  return { componentId }
}
