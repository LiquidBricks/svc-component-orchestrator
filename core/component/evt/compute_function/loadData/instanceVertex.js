import { Errors } from '../../../../../errors.js'
import { domain } from '@liquid-bricks/spec-domain/domain'

export async function instanceVertex({ scope: { handlerDiagnostics, instanceId }, rootCtx: { g } }) {
  const [instanceVertexId] = await g.V()
    .has('label', domain.vertex.componentInstance.constants.LABEL)
    .has('instanceId', instanceId).id()
  handlerDiagnostics.require(instanceVertexId, Errors.PRECONDITION_INVALID, `componentInstance ${instanceId} not found`, { instanceId })
  return { instanceVertexId }
}
