import { domain } from '@liquid-bricks/spec-domain/domain'
import { findImportPathBetweenComponents, findStateEdgeForNodeInInstanceTree, normalizeResult, setNested, vertexLabelToType } from '../../../../componentInstance/cmd/dependencyUtils.js'

const DEPENDENCY_EDGE_LABELS = Object.freeze([
  domain.edge.has_dependency.task_task.constants.LABEL,
  domain.edge.has_dependency.task_data.constants.LABEL,
  domain.edge.has_dependency.task_deferred.constants.LABEL,
])

export async function taskDependencyResults({ rootCtx: { g, dataMapper }, scope: { instanceVertexId, taskNodeId } }) {
  const [dependentComponentId] = await dataMapper.query.findDependentComponentId({ vertexId: instanceVertexId })

  const dependencyNodeIds = await dataMapper.query.listDependencyNodeIds({ edgeLabels: DEPENDENCY_EDGE_LABELS, vertexId: taskNodeId })

  const deps = {}
  const seen = new Set()
  const stateEdgeCache = new Map()
  const importPathCache = new Map()

  for (const depNodeId of dependencyNodeIds ?? []) {
    if (!depNodeId || seen.has(depNodeId)) continue
    seen.add(depNodeId)

    const stateEdgeInfo = await findStateEdgeForNodeInInstanceTree({
      g, dataMapper,
      rootInstanceVertexId: instanceVertexId,
      targetNodeId: depNodeId,
      stateEdgeCache,
    })
    if (!stateEdgeInfo) continue

    const [depValues] = await dataMapper.query.readDepValues({ vertexId: depNodeId })
    const depLabelValues = depValues?.label ?? depValues
    const depLabel = vertexLabelToType(Array.isArray(depLabelValues) ? depLabelValues[0] : depLabelValues)
    const depNameValues = depValues?.name ?? depValues
    const depName = Array.isArray(depNameValues) ? depNameValues[0] : depNameValues

    let depComponentId
    if (depLabel === 'task') {
      [depComponentId] = await dataMapper.query.findComponentIdForTask({ vertexId: depNodeId })
    } else if (depLabel === 'data') {
      [depComponentId] = await dataMapper.query.findComponentIdForData({ vertexId: depNodeId })
    } else {
      [depComponentId] = await dataMapper.query.findComponentIdForDeferred({ vertexId: depNodeId })
    }

    let aliasPath = []
    if (depComponentId && dependentComponentId && depComponentId !== dependentComponentId) {
      if (importPathCache.has(depComponentId)) {
        aliasPath = importPathCache.get(depComponentId) ?? []
      } else {
        aliasPath = await findImportPathBetweenComponents({
          g, dataMapper,
          fromComponentId: dependentComponentId,
          toComponentId: depComponentId,
        }) ?? []
        importPathCache.set(depComponentId, aliasPath)
      }
    }

    const [stateValues] = await dataMapper.query.readDependencyStateResult({ edgeId: stateEdgeInfo.stateEdgeId })
    const resultValues = stateValues?.result ?? stateValues
    const result = normalizeResult(Array.isArray(resultValues) ? resultValues[0] : resultValues)
    const path = [...aliasPath, depLabel, depName].join('.')
    setNested(deps, path, result)
  }

  return { deps }
}
