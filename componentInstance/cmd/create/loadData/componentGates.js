import { domain } from '@liquid-bricks/spec-domain/domain'

export async function componentGates({ rootCtx: { g }, scope: { componentId } }) {
  const gates = []
  const gateRefIds = await g.V(componentId)
    .out(domain.edge.has_gate.component_gateRef.constants.LABEL)
    .id()

  for (const gateRefId of gateRefIds ?? []) {
    const [edgeValues] = await g.V(gateRefId).valueMap('alias', 'fnc')
    const aliasValues = edgeValues?.alias ?? edgeValues
    const fncValues = edgeValues?.fnc ?? edgeValues
    const alias = Array.isArray(aliasValues) ? aliasValues[0] : aliasValues
    const fnc = Array.isArray(fncValues) ? fncValues[0] : fncValues

    const [gatedComponentId] = await g
      .V(gateRefId)
      .out(domain.edge.gate_of.gateRef_component.constants.LABEL)
      .id()
    const [gatedComponentValues] = gatedComponentId ? await g.V(gatedComponentId).valueMap('hash') : []
    const gatedHashValues = gatedComponentValues?.hash ?? gatedComponentValues

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
    const waitFor = Array.from(new Set(
      [...(taskWaitForIds ?? []), ...(dataWaitForIds ?? [])]
        .filter((value) => value !== undefined && value !== null && value !== '')
        .map(String)
    ))
    const deps = Array.from(new Set(
      [...(depsTaskIds ?? []), ...(depsDataIds ?? [])]
        .filter((value) => value !== undefined && value !== null && value !== '')
        .map(String)
    ))

    gates.push({
      alias,
      fnc,
      componentId: gatedComponentId,
      componentHash: gatedHashValues?.hash ?? gatedHashValues,
      waitFor,
      deps,
      gateRefId,
    })
  }

  return { gates }
}
