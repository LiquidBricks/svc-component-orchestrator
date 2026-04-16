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

export async function usesGateInstances({ rootCtx: { g }, scope: { instanceVertexId } }) {
  const gates = []
  const gateRefInstanceIds = await g
    .V(instanceVertexId)
    .out(domain.edge.uses_gate.componentInstance_gateInstanceRef.constants.LABEL)
    .id()

  for (const gateRefInstanceId of gateRefInstanceIds ?? []) {
    const [gateRefId] = await g
      .V(gateRefInstanceId)
      .out(domain.edge.uses_gate.gateInstanceRef_gateRef.constants.LABEL)
      .id()

    const [aliasValues] = gateRefId ? await g.V(gateRefId).valueMap('alias') : []
    const aliasRaw = aliasValues?.alias ?? aliasValues
    const alias = Array.isArray(aliasRaw) ? aliasRaw[0] : aliasRaw

    const taskWaitForIds = gateRefId
      ? await g.V(gateRefId).out(domain.edge.wait_for.gateRef_task.constants.LABEL).id()
      : []
    const dataWaitForIds = gateRefId
      ? await g.V(gateRefId).out(domain.edge.wait_for.gateRef_data.constants.LABEL).id()
      : []
    const depsTaskIds = gateRefId
      ? await g.V(gateRefId).out(domain.edge.has_dependency.gateRef_task.constants.LABEL).id()
      : []
    const depsDataIds = gateRefId
      ? await g.V(gateRefId).out(domain.edge.has_dependency.gateRef_data.constants.LABEL).id()
      : []

    const waitFor = normalizeValues([
      ...(taskWaitForIds ?? []),
      ...(dataWaitForIds ?? []),
    ])
    const deps = normalizeValues([
      ...(depsTaskIds ?? []),
      ...(depsDataIds ?? []),
    ])

    const [gateInstanceVertexId] = await g
      .V(gateRefInstanceId)
      .out(domain.edge.uses_gate.gateInstanceRef_componentInstance.constants.LABEL)
      .id()
    if (!gateInstanceVertexId) continue
    const [instanceValues] = await g.V(gateInstanceVertexId).valueMap('instanceId')
    const instanceIdValues = instanceValues?.instanceId ?? instanceValues
    const gateInstanceId = Array.isArray(instanceIdValues) ? instanceIdValues[0] : instanceIdValues
    if (!gateInstanceId) continue

    gates.push({ instanceId: gateInstanceId, alias, waitFor, deps, instanceVertexId: gateInstanceVertexId })
  }

  return { usesGateInstances: gates }
}
