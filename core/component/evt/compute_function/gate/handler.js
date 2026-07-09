export async function handler({
  rootCtx: { dataMapper },
  scope: { instanceId, instanceVertexId, gateInstanceRefId, name, result, resultValue, updatedAt },
}) {
  let resolvedGateInstanceRefId = gateInstanceRefId
  if (!resolvedGateInstanceRefId && instanceVertexId && name) {
    const [foundGateInstanceRefId] = await dataMapper.query.findGateInstanceRefIdByAlias({ vertexId: instanceVertexId, alias: name })
    resolvedGateInstanceRefId = foundGateInstanceRefId
  }
  if (!resolvedGateInstanceRefId) return { instanceId }

  const serializedResult = typeof resultValue === 'string'
    ? resultValue
    : (result != null ? JSON.stringify(result) : '')

  await dataMapper.vertex.gateInstanceRef.setResultAndUpdatedAt({
    result: serializedResult,
    gateInstanceRefId: resolvedGateInstanceRefId,
    updatedAt,
  })

  return { instanceId, gateInstanceRefId: resolvedGateInstanceRefId, updatedAt }
}
