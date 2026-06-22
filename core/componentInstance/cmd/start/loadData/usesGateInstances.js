import { domain } from '@liquid-bricks/spec-domain/domain'

function normalizeValues(list = []) {
  const raw = Array.isArray(list) && list.length === 1 ? list[0] : list
  const normalized = Array.isArray(raw) ? raw : (raw === undefined || raw === null ? [] : [raw])
  return Array.from(new Set(
    normalized
      .filter((value) => value !== undefined && value !== null && value !== '')
      .map(String)
  ))
}

export async function usesGateInstances({ rootCtx: { g, dataMapper }, scope: { instanceVertexId } }) {
  const gates = []
  const gateRefInstanceIds = await dataMapper.query.listGateRefInstanceIds({ vertexId: instanceVertexId })

  for (const gateRefInstanceId of gateRefInstanceIds ?? []) {
    const [gateRefId] = await dataMapper.query.findGateRefIdForInstanceRef({ vertexId: gateRefInstanceId })

    const [aliasValues] = gateRefId ? await dataMapper.query.readGateRefAlias({ vertexId: gateRefId }) : []
    const aliasRaw = aliasValues?.alias ?? aliasValues
    const alias = Array.isArray(aliasRaw) ? aliasRaw[0] : aliasRaw

    const taskWaitForIds = gateRefId
      ? await dataMapper.query.listGateTaskWaitForIds({ vertexId: gateRefId })
      : []
    const dataWaitForIds = gateRefId
      ? await dataMapper.query.listGateDataWaitForIds({ vertexId: gateRefId })
      : []
    const depsTaskIds = gateRefId
      ? await dataMapper.query.listDepsTaskIds({ vertexId: gateRefId })
      : []
    const depsDataIds = gateRefId
      ? await dataMapper.query.listDepsDataIds({ vertexId: gateRefId })
      : []

    const waitFor = normalizeValues([
      ...(taskWaitForIds ?? []),
      ...(dataWaitForIds ?? []),
    ])
    const deps = normalizeValues([
      ...(depsTaskIds ?? []),
      ...(depsDataIds ?? []),
    ])

    const [gateInstanceVertexId] = await dataMapper.query.findGateInstanceVertexIdForRef({ vertexId: gateRefInstanceId })
    if (!gateInstanceVertexId) continue
    const [instanceValues] = await dataMapper.query.readGateInstanceId({ vertexId: gateInstanceVertexId })
    const instanceIdValues = instanceValues?.instanceId ?? instanceValues
    const gateInstanceId = Array.isArray(instanceIdValues) ? instanceIdValues[0] : instanceIdValues
    if (!gateInstanceId) continue

    gates.push({ instanceId: gateInstanceId, alias, waitFor, deps, instanceVertexId: gateInstanceVertexId })
  }

  return { usesGateInstances: gates }
}
