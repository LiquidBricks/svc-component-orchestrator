import { domain } from '@liquid-bricks/spec-domain/domain'
import { findImportPathBetweenComponents, findStateEdgeForNodeInInstanceTree, normalizeResult, setNested, vertexLabelToType } from '../../../../componentInstance/cmd/dependencyUtils.js'

const DEPENDENCY_EDGE_LABELS = Object.freeze([
  domain.edge.has_dependency.data_task.constants.LABEL,
  domain.edge.has_dependency.data_data.constants.LABEL,
  domain.edge.has_dependency.data_deferred.constants.LABEL,
])

export async function dependencyResults({ rootCtx: { g }, scope: { componentInstanceVertexId, dataVertexId } }) {
  const [dependentComponentId] = await g
    .V(componentInstanceVertexId)
    .out(domain.edge.instance_of.componentInstance_component.constants.LABEL)
    .id()

  const dependencyNodeIds = await g
    .V(dataVertexId)
    .out(...DEPENDENCY_EDGE_LABELS)
    .id()

  const deps = {}
  const seen = new Set()
  const stateEdgeCache = new Map()
  const importPathCache = new Map()

  for (const depNodeId of dependencyNodeIds ?? []) {
    if (!depNodeId || seen.has(depNodeId)) continue
    seen.add(depNodeId)

    const stateEdgeInfo = await findStateEdgeForNodeInInstanceTree({
      g,
      rootInstanceVertexId: componentInstanceVertexId,
      targetNodeId: depNodeId,
      stateEdgeCache,
    })
    if (!stateEdgeInfo) continue

    const [depValues] = await g.V(depNodeId).valueMap('label', 'name')
    const depLabelValues = depValues?.label ?? depValues
    const depLabel = vertexLabelToType(Array.isArray(depLabelValues) ? depLabelValues[0] : depLabelValues)
    const depNameValues = depValues?.name ?? depValues
    const depName = Array.isArray(depNameValues) ? depNameValues[0] : depNameValues

    let depComponentId
    if (depLabel === 'task') {
      [depComponentId] = await g.V(depNodeId).in(domain.edge.has_task.component_task.constants.LABEL).id()
    } else if (depLabel === 'data') {
      [depComponentId] = await g.V(depNodeId).in(domain.edge.has_data.component_data.constants.LABEL).id()
    } else {
      [depComponentId] = await g.V(depNodeId).in(domain.edge.has_deferred.component_deferred.constants.LABEL).id()
    }

    let aliasPath = []
    if (depComponentId && dependentComponentId && depComponentId !== dependentComponentId) {
      if (importPathCache.has(depComponentId)) {
        aliasPath = importPathCache.get(depComponentId) ?? []
      } else {
        aliasPath = await findImportPathBetweenComponents({
          g,
          fromComponentId: dependentComponentId,
          toComponentId: depComponentId,
        }) ?? []
        importPathCache.set(depComponentId, aliasPath)
      }
    }

    const [stateValues] = await g.E(stateEdgeInfo.stateEdgeId).valueMap('result')
    const resultValues = stateValues?.result ?? stateValues
    const result = normalizeResult(Array.isArray(resultValues) ? resultValues[0] : resultValues)
    const path = [...aliasPath, depLabel, depName].join('.')
    setNested(deps, path, result)
  }

  return { deps }
}
