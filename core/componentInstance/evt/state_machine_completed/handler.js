import { domain } from '@liquid-bricks/spec-domain/domain'

export async function handler({ scope: { handlerDiagnostics, stateMachineId, instanceId }, rootCtx: { g, dataMapper } }) {
  const [stateValues] = await dataMapper.query.readStateMachineState({ vertexId: stateMachineId })
  const stateValue = stateValues?.state ?? stateValues
  const currentState = Array.isArray(stateValue) ? stateValue[0] : stateValue

  if (currentState === domain.vertex.stateMachine.constants.STATES.COMPLETE) {
    handlerDiagnostics.info('componentInstance stateMachine already completed', { instanceId, stateMachineId })
    return
  }

  const now = new Date().toISOString()
  await dataMapper.vertex.stateMachine.setComplete({ updatedAt: now, stateMachineId })

}
