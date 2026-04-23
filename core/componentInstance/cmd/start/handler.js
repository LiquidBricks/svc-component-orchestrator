import { domain } from '@liquid-bricks/spec-domain/domain'

export async function handler({ rootCtx: { g }, scope: { stateMachineId } }) {
  await g
    .V(stateMachineId)
    .property('state', domain.vertex.stateMachine.constants.STATES.RUNNING)
    .property('updatedAt', new Date().toISOString())
}
