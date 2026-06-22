import { domain } from '@liquid-bricks/spec-domain/domain'

export async function createComponentInstance({ g, dataMapper, componentId, instanceId }) {
  const { id: instanceVertexId } = await dataMapper.vertex.componentInstance.create({ instanceId })
  await dataMapper.edge.instance_of.componentInstance_component.create({ fromId: instanceVertexId, toId: componentId })

  const { id: stateMachineId } = await dataMapper.vertex.stateMachine.create()
  await dataMapper.edge.has_stateMachine.componentInstance_stateMachine.create({ fromId: instanceVertexId, toId: stateMachineId })

  const dataNodeIds = await dataMapper.query.listDataNodeIds({ vertexId: componentId })
  for (const nodeId of dataNodeIds ?? []) {
    if (!nodeId) continue
    await dataMapper.edge.has_data_state.stateMachine_data.create({ fromId: stateMachineId, toId: nodeId })
  }

  const taskNodeIds = await dataMapper.query.listTaskNodeIds({ vertexId: componentId })
  for (const taskId of taskNodeIds ?? []) {
    if (!taskId) continue
    await dataMapper.edge.has_task_state.stateMachine_task.create({ fromId: stateMachineId, toId: taskId })
  }

  return { instanceVertexId, stateMachineId }
}
