import { PRECONDITION_INVALID } from '@liquid-bricks/lib-diagnostics/codes'
import { domain } from '@liquid-bricks/spec-domain/domain'

export async function stateMachine({ scope: { handlerDiagnostics, instanceVertexId, instanceId }, rootCtx: { g, dataMapper } }) {
  const [stateMachineId] = await dataMapper.query.readStateMachineId({ vertexId: instanceVertexId })
  handlerDiagnostics.require(stateMachineId, PRECONDITION_INVALID, `stateMachine for componentInstance ${instanceId} not found`, { instanceId })
  return { stateMachineId }
}
