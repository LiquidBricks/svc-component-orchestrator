import { domain } from '@liquid-bricks/spec-domain/domain'

export async function taskNodes({ rootCtx: { g, dataMapper }, scope: { instanceId, stateId } }) {
  const [instanceVertexId] = await dataMapper.query.findInstanceVertexId({ instanceId })

  const [stateMachineId] = await dataMapper.query.readStateMachineId({ vertexId: instanceVertexId })

  const [componentRows] = await dataMapper.query.readComponentRows({ vertexId: instanceVertexId })

  const componentHash = componentRows.hash

  const [taskNodeId] = await dataMapper.query.findTaskNodeId({ edgeId: stateId })

  const [taskRows] = await dataMapper.query.readTaskRows({ vertexId: taskNodeId })

  const name = taskRows.name

  return { stateMachineId, instanceVertexId, componentHash, name, taskNodeId }
}
