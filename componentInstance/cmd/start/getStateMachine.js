import { domain } from '@liquid-bricks/spec-domain/domain'

export async function getStateMachine({ rootCtx: { g }, scope: { instanceVertexId } }) {
  const [stateMachineId] = await g.V(instanceVertexId)
    .out(domain.edge.has_stateMachine.componentInstance_stateMachine.constants.LABEL)
    .id()

  return { stateMachineId }
}
