import { domain } from '@liquid-bricks/spec-domain/domain'

export async function taskNodes({ rootCtx: { g }, scope: { instanceId, stateId } }) {
  const [instanceVertexId] = await g.V()
    .has('label', domain.vertex.componentInstance.constants.LABEL)
    .has('instanceId', instanceId)
    .id()

  const [stateMachineId] = await g
    .V(instanceVertexId)
    .out(domain.edge.has_stateMachine.componentInstance_stateMachine.constants.LABEL)
    .id()

  const [componentRows] = await g
    .V(instanceVertexId)
    .out(domain.edge.instance_of.componentInstance_component.constants.LABEL)
    .valueMap('hash')

  const componentHash = componentRows.hash

  const [taskNodeId] = await g
    .E(stateId)
    .inV()
    .id()

  const [taskRows] = await g
    .V(taskNodeId)
    .valueMap('name')

  const name = taskRows.name

  return { stateMachineId, instanceVertexId, componentHash, name, taskNodeId }
}
