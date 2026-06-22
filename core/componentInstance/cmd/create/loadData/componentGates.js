import { domain } from '@liquid-bricks/spec-domain/domain'

export async function componentGates({ rootCtx: { g, dataMapper }, scope: { componentId } }) {
  const gates = []
  const gateRefIds = await dataMapper.query.listGateRefIds({ vertexId: componentId })

  for (const gateRefId of gateRefIds ?? []) {
    const [edgeValues] = await dataMapper.query.readGateRefAliasAndFunction({ vertexId: gateRefId })
    const aliasValues = edgeValues?.alias ?? edgeValues
    const fncValues = edgeValues?.fnc ?? edgeValues
    const alias = Array.isArray(aliasValues) ? aliasValues[0] : aliasValues
    const fnc = Array.isArray(fncValues) ? fncValues[0] : fncValues

    const [gatedComponentId] = await dataMapper.query.findGatedComponentIdForGateRef({ vertexId: gateRefId })
    const [gatedComponentValues] = gatedComponentId ? await dataMapper.query.readGatedComponentValues({ vertexId: gatedComponentId }) : []
    const gatedHashValues = gatedComponentValues?.hash ?? gatedComponentValues

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
