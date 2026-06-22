import { domain } from '@liquid-bricks/spec-domain/domain'

export async function findDependencyFreeStates({ rootCtx: { g, dataMapper }, scope: { stateMachineId } }) {
  return {
    dataStateIds: await dataMapper.query.findHasDataStateStateMachineData({ vertexId: stateMachineId }),
    taskStateIds: await dataMapper.query.findHasTaskStateStateMachineTask({ vertexId: stateMachineId }),
  }
}
