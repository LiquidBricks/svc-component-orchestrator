import { domain } from '@liquid-bricks/spec-domain/domain'

export async function handler({ rootCtx: { g, dataMapper }, scope: { stateMachineId } }) {
  await dataMapper.mutation.markStateMachineRunning({ vertexId: stateMachineId })
}
