import { Errors } from '../../../../errors.js'
import { domain } from '@liquid-bricks/spec-domain/domain'

export async function doesInstanceExist({ rootCtx: { g, dataMapper }, scope: { handlerDiagnostics, instanceId } }) {
  const [instanceVertexId] = await dataMapper.query.findInstanceVertexId({ instanceId })

  handlerDiagnostics.require(instanceVertexId, Errors.PRECONDITION_INVALID, `componentInstance ${instanceId} not found`, { instanceId })
  return { instanceVertexId }
}
