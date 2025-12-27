import { domain } from '@liquid-bricks/spec-domain/domain'

export async function nodes({ rootCtx: { g }, scope: { instanceId, stateId } }) {
  const [componentInstanceVertexId] = await g.V()
    .has('label', domain.vertex.componentInstance.constants.LABEL)
    .has('instanceId', instanceId)
    .id()

  const [serviceVertexId] = await g
    .E(stateId)
    .inV()
    .id()

  const [componentVertexId] = await g.V(componentInstanceVertexId)
    .out(domain.edge.instance_of.componentInstance_component.constants.LABEL)
    .id()

  const [stateMachineVertexId] = await g.V(componentInstanceVertexId)
    .out(domain.edge.has_stateMachine.componentInstance_stateMachine.constants.LABEL)
    .id()

  const [serviceRow] = await g.V(serviceVertexId).valueMap('name')
  const [componentRow] = await g.V(componentVertexId).valueMap('hash')

  return {
    componentInstanceVertexId,
    componentVertexId,
    stateMachineVertexId,
    serviceVertexId,
    name: serviceRow.name,
    componentHash: componentRow.hash,
  }
}
