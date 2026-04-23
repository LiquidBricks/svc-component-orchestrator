import { domain } from '@liquid-bricks/spec-domain/domain'

export async function handler({ scope: { handlerDiagnostics, stateMachineId, instanceId }, rootCtx: { g } }) {
  const [stateValues] = await g.V(stateMachineId).valueMap('state')
  const stateValue = stateValues?.state ?? stateValues
  const currentState = Array.isArray(stateValue) ? stateValue[0] : stateValue

  if (currentState === domain.vertex.stateMachine.constants.STATES.COMPLETE) {
    handlerDiagnostics.info('componentInstance stateMachine already completed', { instanceId, stateMachineId })
    return
  }

  const now = new Date().toISOString()
  await g
    .V(stateMachineId)
    .property('state', domain.vertex.stateMachine.constants.STATES.COMPLETE)
    .property('updatedAt', now)

}
