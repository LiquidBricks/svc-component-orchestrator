import { domain } from '@liquid-bricks/spec-domain/domain'

export async function nodes({ rootCtx: { g, dataMapper }, scope: { instanceId, stateId } }) {
  const [componentInstanceVertexId] = await dataMapper.query.findComponentInstanceVertexId({ instanceId })

  const [dataVertexId] = await dataMapper.query.findDataVertexId({ edgeId: stateId })

  const [componentVertexId] = await dataMapper.query.findComponentVertexId({ vertexId: componentInstanceVertexId })

  const [stateMachineVertexId] = await dataMapper.query.readStateMachineVertexId({ vertexId: componentInstanceVertexId })

  const [dataRow] = await dataMapper.query.readDataRow({ vertexId: dataVertexId })
  const [componentRow] = await dataMapper.query.readComponentRow({ vertexId: componentVertexId })

  return {
    componentInstanceVertexId,
    componentVertexId,
    stateMachineVertexId,
    dataVertexId,
    name: dataRow.name,
    componentHash: componentRow.hash,
  }
}
