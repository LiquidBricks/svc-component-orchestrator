import { domain } from '@liquid-bricks/spec-domain/domain'

export async function getStateMachine({ rootCtx: { g, dataMapper }, scope: { instanceVertexId } }) {
  const [stateMachineId] = await dataMapper.query.readStateMachineId({ vertexId: instanceVertexId })

  return { stateMachineId }
}
