import { PRECONDITION_INVALID } from '@liquid-bricks/lib-diagnostics/codes'
import { domain } from '@liquid-bricks/spec-domain/domain'

export async function doesInstanceExist({ rootCtx: { g, dataMapper }, scope: { handlerDiagnostics, instanceId } }) {
  const [instanceVertexId] = await dataMapper.query.findInstanceVertexId({ instanceId })

  handlerDiagnostics.require(instanceVertexId, PRECONDITION_INVALID, `componentInstance ${instanceId} not found`, { instanceId })
  return { instanceVertexId }
}
