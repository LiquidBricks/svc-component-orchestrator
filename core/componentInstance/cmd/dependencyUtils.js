import { domain } from '@liquid-bricks/spec-domain/domain'

const STATE_EDGE_LABELS = Object.freeze([
  domain.edge.has_task_state.stateMachine_task.constants.LABEL,
  domain.edge.has_data_state.stateMachine_data.constants.LABEL,
])
export const PROVIDED_STATUS = domain.edge.has_task_state.stateMachine_task.constants.Status.PROVIDED

export function normalizeResult(value) {
  if (typeof value === 'string') {
    try {
      return JSON.parse(value)
    } catch {
      return value
    }
  }
  return value ?? null
}

export function vertexLabelToType(label) {
  if (label === domain.vertex.task.constants.LABEL) return 'task'
  if (label === domain.vertex.data.constants.LABEL) return 'data'
  return String(label ?? '')
}

export function setNested(obj, path, value) {
  const parts = String(path ?? '').split('.').filter(Boolean)
  if (!parts.length) return obj

  let ref = obj
  for (let i = 0; i < parts.length; i += 1) {
    const key = parts[i]
    if (i === parts.length - 1) {
      ref[key] = value
      continue
    }

    if (typeof ref[key] !== 'object' || ref[key] === null) {
      ref[key] = {}
    }
    ref = ref[key]
  }

  return obj
}

const DEPENDENCY_NODE_EDGE_LABELS = Object.freeze({
  task: domain.edge.has_task.component_task.constants.LABEL,
  data: domain.edge.has_data.component_data.constants.LABEL,
  deferred: domain.edge.has_deferred.component_deferred.constants.LABEL,
})

function parseDependencyPath(path) {
  const parts = String(path ?? '').split('.').filter(Boolean)
  if (parts.length < 2) return null
  const targetType = parts[parts.length - 2]
  const targetName = parts[parts.length - 1]
  const importPath = parts.slice(0, parts.length - 2)
  if (!DEPENDENCY_NODE_EDGE_LABELS[targetType] || !targetName) return null
  return { importPath, targetType, targetName }
}

async function resolveDependencyPathTargetId({
  g,
  rootInstanceVertexId,
  targetPath,
  pathResolutionCache,
}) {
  if (!g || !rootInstanceVertexId) return null
  const trimmedPath = String(targetPath ?? '').trim()
  if (!trimmedPath || !trimmedPath.includes('.')) return trimmedPath || null

  const cacheKey = `${rootInstanceVertexId}:${trimmedPath}`
  if (pathResolutionCache?.has(cacheKey)) return pathResolutionCache.get(cacheKey)

  const parsed = parseDependencyPath(trimmedPath)
  if (!parsed) {
    pathResolutionCache?.set(cacheKey, null)
    return null
  }

  const [rootComponentId] = await g
    .V(rootInstanceVertexId)
    .out(domain.edge.instance_of.componentInstance_component.constants.LABEL)
    .id()
  if (!rootComponentId) {
    pathResolutionCache?.set(cacheKey, null)
    return null
  }

  let componentId = rootComponentId
  for (const alias of parsed.importPath ?? []) {
    const [importRefId] = await g
      .V(componentId)
      .out(domain.edge.has_import.component_importRef.constants.LABEL)
      .has('alias', alias)
      .id()

    const [gateRefId] = importRefId ? [] : await g
      .V(componentId)
      .out(domain.edge.has_gate.component_gateRef.constants.LABEL)
      .has('alias', alias)
      .id()

    if (!importRefId && !gateRefId) {
      pathResolutionCache?.set(cacheKey, null)
      return null
    }

    const [nextComponentId] = await g
      .V(importRefId ?? gateRefId)
      .out(importRefId ? domain.edge.import_of.importRef_component.constants.LABEL : domain.edge.gate_of.gateRef_component.constants.LABEL)
      .id()
    if (!nextComponentId) {
      pathResolutionCache?.set(cacheKey, null)
      return null
    }
    componentId = nextComponentId
  }

  const edgeLabel = DEPENDENCY_NODE_EDGE_LABELS[parsed.targetType]
  const [nodeId] = await g
    .V(componentId)
    .out(edgeLabel)
    .has('name', parsed.targetName)
    .id()

  const resolved = nodeId ?? null
  pathResolutionCache?.set(cacheKey, resolved)
  return resolved
}

export async function findStateEdgeForNodeInInstanceTree({
  g,
  rootInstanceVertexId,
  targetNodeId,
  stateEdgeCache = new Map(),
  preferredStateEdges,
}) {
  if (!rootInstanceVertexId || !targetNodeId) return null

  const cacheKey = `${rootInstanceVertexId}:${targetNodeId}`
  if (stateEdgeCache.has(cacheKey)) return stateEdgeCache.get(cacheKey)

  const preferred = preferredStateEdges?.get?.(targetNodeId)
  if (preferred) {
    stateEdgeCache.set(cacheKey, preferred)
    return preferred
  }

  const visited = new Set()
  const queue = [rootInstanceVertexId]

  while (queue.length) {
    const instanceVertexId = queue.shift()
    if (!instanceVertexId || visited.has(instanceVertexId)) continue
    visited.add(instanceVertexId)

    const [stateMachineId] = await g
      .V(instanceVertexId)
      .out(domain.edge.has_stateMachine.componentInstance_stateMachine.constants.LABEL)
      .id()
    if (stateMachineId) {
      for (const stateEdgeLabel of STATE_EDGE_LABELS) {
        const [stateEdgeId] = await g
          .V(stateMachineId)
          .outE(stateEdgeLabel)
          .filter(_ => _.inV().has('id', targetNodeId))
          .id()
        if (stateEdgeId) {
          const result = { stateMachineId, stateEdgeId, stateEdgeLabel, instanceVertexId }
          stateEdgeCache.set(cacheKey, result)
          return result
        }
      }
    }

    const importedInstanceIds = await g
      .V(instanceVertexId)
      .out(domain.edge.uses_import.componentInstance_importInstanceRef.constants.LABEL)
      .out(domain.edge.uses_import.importInstanceRef_componentInstance.constants.LABEL)
      .id()
    for (const importedInstanceId of importedInstanceIds ?? []) {
      if (!importedInstanceId || visited.has(importedInstanceId)) continue
      queue.push(importedInstanceId)
    }

    const gatedInstanceIds = await g
      .V(instanceVertexId)
      .out(domain.edge.uses_gate.componentInstance_gateInstanceRef.constants.LABEL)
      .out(domain.edge.uses_gate.gateInstanceRef_componentInstance.constants.LABEL)
      .id()
    for (const gatedInstanceId of gatedInstanceIds ?? []) {
      if (!gatedInstanceId || visited.has(gatedInstanceId)) continue
      queue.push(gatedInstanceId)
    }
  }

  stateEdgeCache.set(cacheKey, null)
  return null
}

export async function findImportPathBetweenComponents({ g, fromComponentId, toComponentId }) {
  const visited = new Set()
  const queue = [{ componentId: fromComponentId, path: [] }]

  while (queue.length) {
    const { componentId, path } = queue.shift()
    if (componentId === toComponentId) return path
    if (visited.has(componentId)) continue
    visited.add(componentId)

    const importRefIds = await g.V(componentId)
      .out(domain.edge.has_import.component_importRef.constants.LABEL)
      .id()

    for (const importRefId of importRefIds ?? []) {
      const [edgeValues] = await g.V(importRefId).valueMap('alias')
      const aliasValues = edgeValues?.alias ?? edgeValues
      const alias = Array.isArray(aliasValues) ? aliasValues[0] : aliasValues
      const [nextComponentId] = await g
        .V(importRefId)
        .out(domain.edge.import_of.importRef_component.constants.LABEL)
        .id()
      if (!alias || !nextComponentId) continue
      queue.push({ componentId: nextComponentId, path: [...path, alias] })
    }

    const gateRefIds = await g.V(componentId)
      .out(domain.edge.has_gate.component_gateRef.constants.LABEL)
      .id()
    for (const gateRefId of gateRefIds ?? []) {
      const [edgeValues] = await g.V(gateRefId).valueMap('alias')
      const aliasValues = edgeValues?.alias ?? edgeValues
      const alias = Array.isArray(aliasValues) ? aliasValues[0] : aliasValues
      const [nextComponentId] = await g
        .V(gateRefId)
        .out(domain.edge.gate_of.gateRef_component.constants.LABEL)
        .id()
      if (!alias || !nextComponentId) continue
      queue.push({ componentId: nextComponentId, path: [...path, alias] })
    }
  }
  return null
}

export async function getStateEdgeStatus({ g, stateEdgeId }) {
  const [statusValues] = await g.E(stateEdgeId).valueMap('status')
  const statusMap = Array.isArray(statusValues) ? statusValues[0] : statusValues
  const statusValuesMap = statusMap?.status ?? statusMap
  return Array.isArray(statusValuesMap) ? statusValuesMap[0] : statusValuesMap
}

export async function isNodeProvided({
  g,
  rootInstanceVertexId,
  targetNodeId,
  stateEdgeCache,
  pathResolutionCache,
}) {
  const resolvedTargetNodeId = (typeof targetNodeId === 'string' && targetNodeId.includes('.'))
    ? await resolveDependencyPathTargetId({
      g,
      rootInstanceVertexId,
      targetPath: targetNodeId,
      pathResolutionCache,
    })
    : targetNodeId
  if (!resolvedTargetNodeId) return false

  const stateEdgeInfo = await findStateEdgeForNodeInInstanceTree({
    g,
    rootInstanceVertexId,
    targetNodeId: resolvedTargetNodeId,
    stateEdgeCache,
  })
  if (!stateEdgeInfo) return false

  const status = await getStateEdgeStatus({ g, stateEdgeId: stateEdgeInfo.stateEdgeId })
  return status === PROVIDED_STATUS
}

export async function getInstanceState({ g, instanceVertexId }) {
  const [stateMachineId] = await g
    .V(instanceVertexId)
    .out(domain.edge.has_stateMachine.componentInstance_stateMachine.constants.LABEL)
    .id()
  if (!stateMachineId) return null

  const [stateValues] = await g.V(stateMachineId).valueMap('state')
  const stateMap = Array.isArray(stateValues) ? stateValues[0] : stateValues
  const stateValuesMap = stateMap?.state ?? stateMap
  return Array.isArray(stateValuesMap) ? stateValuesMap[0] : stateValuesMap
}

export async function hasInstanceStarted({ g, instanceVertexId }) {
  const state = await getInstanceState({ g, instanceVertexId })
  if (!state) return false
  return state === domain.vertex.stateMachine.constants.STATES.RUNNING
    || state === domain.vertex.stateMachine.constants.STATES.COMPLETE
}
