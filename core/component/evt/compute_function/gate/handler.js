import { domain } from '@liquid-bricks/spec-domain/domain'

export async function handler({ rootCtx: { g, dataMapper }, scope: { instanceId, instanceVertexId, name, result } }) {
  if (!instanceVertexId || !name) return { instanceId }

  const [gateInstanceRefId] = await dataMapper.query.findGateInstanceRefIdByAlias({ vertexId: instanceVertexId, alias: name })
  if (!gateInstanceRefId) return { instanceId }

  await dataMapper.vertex.gateInstanceRef.setResultAndUpdatedAt({ result: result != null ? JSON.stringify(result) : '', gateInstanceRefId })

  return { instanceId }
}
