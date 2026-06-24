import { domain } from '@liquid-bricks/spec-domain/domain'

export const LIFECYCLE_WAIT_FOR_PROPERTY = domain.vertex.importRef.constants.LIFECYCLE_WAIT_FOR_PROPERTY

const TASK_STATE_EDGE_LABEL = domain.edge.has_task_state.stateMachine_task.constants.LABEL
const DATA_STATE_EDGE_LABEL = domain.edge.has_data_state.stateMachine_data.constants.LABEL
export const PROVIDED_STATUS = domain.edge.has_task_state.stateMachine_task.constants.Status.PROVIDED

export function normalizeLifecycleWaitForValues(value) {
  const values = Array.isArray(value) ? value : [value]
  const normalized = []

  for (const item of values) {
    if (item === undefined || item === null || item === '') continue
    let parsed = item
    if (typeof item === 'string') {
      try {
        parsed = JSON.parse(item)
      } catch {
        parsed = item
      }
    }
    if (Array.isArray(parsed)) {
      normalized.push(...normalizeLifecycleWaitForValues(parsed))
    } else if (parsed !== undefined && parsed !== null && parsed !== '') {
      normalized.push(String(parsed))
    }
  }

  return Array.from(new Set(normalized))
}

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

const DEPENDENCY_NODE_TYPES = Object.freeze(['task', 'data', 'deferred'])

function parseDependencyPath(path) {
  const parts = String(path ?? '').split('.').filter(Boolean)
  if (parts.length < 2) return null
  const targetType = parts[parts.length - 2]
  const targetName = parts[parts.length - 1]
  const importPath = parts.slice(0, parts.length - 2)
  if (!DEPENDENCY_NODE_TYPES.includes(targetType) || !targetName) return null
  return { importPath, targetType, targetName }
}

function parseLifecycleDependencyPath(targetPath) {
  const parts = String(targetPath ?? '').split('.').filter(Boolean)
  if (parts.length < 2) return null

  const targetType = parts[parts.length - 2]
  if (targetType !== 'lifecycle') return null

  return {
    importPath: parts.slice(0, parts.length - 2),
    targetName: parts[parts.length - 1],
  }
}

async function resolveDependencyPathTargetId({
  g, dataMapper,
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

  const [rootComponentId] = await dataMapper.query.findComponentIdForInstance({ vertexId: rootInstanceVertexId })
  if (!rootComponentId) {
    pathResolutionCache?.set(cacheKey, null)
    return null
  }

  let componentId = rootComponentId
  for (const alias of parsed.importPath ?? []) {
    const [importRefId] = await dataMapper.query.findImportRefIdByAlias({ alias, vertexId: componentId })

    const [gateRefId] = importRefId ? [] : await dataMapper.query.findGateRefIdByAlias({ alias, vertexId: componentId })
    const [nextComponentId] = importRefId
      ? await dataMapper.query.findImportedComponentIdForImportRef({ vertexId: importRefId })
      : await dataMapper.query.findGatedComponentIdForGateRef({ vertexId: gateRefId })

    if (!importRefId && !gateRefId) {
      pathResolutionCache?.set(cacheKey, null)
      return null
    }

    if (!nextComponentId) {
      pathResolutionCache?.set(cacheKey, null)
      return null
    }
    componentId = nextComponentId
  }

  let nodeId = null
  if (parsed.targetType === 'task') {
    ;[nodeId] = await dataMapper.query.findDependencyTaskTargetNodeIdByName({ name: parsed.targetName, vertexId: componentId })
  } else if (parsed.targetType === 'data') {
    ;[nodeId] = await dataMapper.query.findDependencyDataTargetNodeIdByName({ name: parsed.targetName, vertexId: componentId })
  } else if (parsed.targetType === 'deferred') {
    ;[nodeId] = await dataMapper.query.findDependencyDeferredTargetNodeIdByName({ name: parsed.targetName, vertexId: componentId })
  }

  const resolved = nodeId ?? null
  pathResolutionCache?.set(cacheKey, resolved)
  return resolved
}

export async function findStateEdgeForNodeInInstanceTree({
  g, dataMapper,
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

    const [stateMachineId] = await dataMapper.query.readStateMachineId({ vertexId: instanceVertexId })
    if (stateMachineId) {
      const [taskStateEdgeId] = await dataMapper.query.findTaskStateEdgeIdForTargetNode({ vertexId: stateMachineId, id: targetNodeId })
      if (taskStateEdgeId) {
        const result = { stateMachineId, stateEdgeId: taskStateEdgeId, stateEdgeLabel: TASK_STATE_EDGE_LABEL, instanceVertexId }
        stateEdgeCache.set(cacheKey, result)
        return result
      }

      const [dataStateEdgeId] = await dataMapper.query.findDataStateEdgeIdForTargetNode({ vertexId: stateMachineId, id: targetNodeId })
      if (dataStateEdgeId) {
        const result = { stateMachineId, stateEdgeId: dataStateEdgeId, stateEdgeLabel: DATA_STATE_EDGE_LABEL, instanceVertexId }
        stateEdgeCache.set(cacheKey, result)
        return result
      }
    }

    const importedInstanceIds = await dataMapper.query.listImportedInstanceIds({ vertexId: instanceVertexId })
    for (const importedInstanceId of importedInstanceIds ?? []) {
      if (!importedInstanceId || visited.has(importedInstanceId)) continue
      queue.push(importedInstanceId)
    }

    const gatedInstanceIds = await dataMapper.query.listGatedInstanceIds({ vertexId: instanceVertexId })
    for (const gatedInstanceId of gatedInstanceIds ?? []) {
      if (!gatedInstanceId || visited.has(gatedInstanceId)) continue
      queue.push(gatedInstanceId)
    }
  }

  stateEdgeCache.set(cacheKey, null)
  return null
}

export async function findImportPathBetweenComponents({ g, dataMapper, fromComponentId, toComponentId }) {
  const visited = new Set()
  const queue = [{ componentId: fromComponentId, path: [] }]

  while (queue.length) {
    const { componentId, path } = queue.shift()
    if (componentId === toComponentId) return path
    if (visited.has(componentId)) continue
    visited.add(componentId)

    const importRefIds = await dataMapper.query.listImportRefIds({ vertexId: componentId })

    for (const importRefId of importRefIds ?? []) {
      const [edgeValues] = await dataMapper.query.readImportRefAlias({ vertexId: importRefId })
      const aliasValues = edgeValues?.alias ?? edgeValues
      const alias = Array.isArray(aliasValues) ? aliasValues[0] : aliasValues
      const [nextComponentId] = await dataMapper.query.findImportedComponentIdForImportRef({ vertexId: importRefId })
      if (!alias || !nextComponentId) continue
      queue.push({ componentId: nextComponentId, path: [...path, alias] })
    }

    const gateRefIds = await dataMapper.query.listGateRefIds({ vertexId: componentId })
    for (const gateRefId of gateRefIds ?? []) {
      const [edgeValues] = await dataMapper.query.readGateRefAlias({ vertexId: gateRefId })
      const aliasValues = edgeValues?.alias ?? edgeValues
      const alias = Array.isArray(aliasValues) ? aliasValues[0] : aliasValues
      const [nextComponentId] = await dataMapper.query.findGatedComponentIdForGateRef({ vertexId: gateRefId })
      if (!alias || !nextComponentId) continue
      queue.push({ componentId: nextComponentId, path: [...path, alias] })
    }
  }
  return null
}

export async function getStateEdgeStatus({ g, dataMapper, stateEdgeId }) {
  const [statusValues] = await dataMapper.query.readStateEdgeStatus({ edgeId: stateEdgeId })
  const statusMap = Array.isArray(statusValues) ? statusValues[0] : statusValues
  const statusValuesMap = statusMap?.status ?? statusMap
  return Array.isArray(statusValuesMap) ? statusValuesMap[0] : statusValuesMap
}

async function resolveInstancePath({ g, dataMapper, rootInstanceVertexId, importPath = [] }) {
  let currentInstanceVertexId = rootInstanceVertexId

  for (const alias of importPath ?? []) {
    const [importedInstanceVertexId] = await dataMapper.query.findImportedInstanceVertexIdByAlias({ vertexId: currentInstanceVertexId, alias })

    const [gatedInstanceVertexId] = importedInstanceVertexId ? [] : await dataMapper.query.findGatedInstanceVertexIdByAlias({ vertexId: currentInstanceVertexId, alias })

    currentInstanceVertexId = importedInstanceVertexId ?? gatedInstanceVertexId
    if (!currentInstanceVertexId) return null
  }

  return currentInstanceVertexId
}

async function isLifecycleProvided({ g, dataMapper, rootInstanceVertexId, targetPath }) {
  const parsed = parseLifecycleDependencyPath(targetPath)
  if (!parsed) return null
  if (parsed.targetName !== 'done' || !parsed.importPath.length) return false

  const instanceVertexId = await resolveInstancePath({
    g, dataMapper,
    rootInstanceVertexId,
    importPath: parsed.importPath,
  })
  if (!instanceVertexId) return false

  const state = await getInstanceState({ g, dataMapper, instanceVertexId })
  return state === domain.vertex.stateMachine.constants.STATES.COMPLETE
}

export async function isNodeProvided({
  g, dataMapper,
  rootInstanceVertexId,
  targetNodeId,
  stateEdgeCache,
  pathResolutionCache,
}) {
  if (typeof targetNodeId === 'string') {
    const lifecycleProvided = await isLifecycleProvided({
      g, dataMapper,
      rootInstanceVertexId,
      targetPath: targetNodeId,
    })
    if (lifecycleProvided !== null) return lifecycleProvided
  }

  const resolvedTargetNodeId = (typeof targetNodeId === 'string' && targetNodeId.includes('.'))
    ? await resolveDependencyPathTargetId({
      g, dataMapper,
      rootInstanceVertexId,
      targetPath: targetNodeId,
      pathResolutionCache,
    })
    : targetNodeId
  if (!resolvedTargetNodeId) return false

  const stateEdgeInfo = await findStateEdgeForNodeInInstanceTree({
    g, dataMapper,
    rootInstanceVertexId,
    targetNodeId: resolvedTargetNodeId,
    stateEdgeCache,
  })
  if (!stateEdgeInfo) return false

  const status = await getStateEdgeStatus({ g, dataMapper, stateEdgeId: stateEdgeInfo.stateEdgeId })
  return status === PROVIDED_STATUS
}

export async function getInstanceState({ g, dataMapper, instanceVertexId }) {
  const [stateMachineId] = await dataMapper.query.readStateMachineId({ vertexId: instanceVertexId })
  if (!stateMachineId) return null

  const [stateValues] = await dataMapper.query.readStateMachineState({ vertexId: stateMachineId })
  const stateMap = Array.isArray(stateValues) ? stateValues[0] : stateValues
  const stateValuesMap = stateMap?.state ?? stateMap
  return Array.isArray(stateValuesMap) ? stateValuesMap[0] : stateValuesMap
}

export async function hasInstanceStarted({ g, dataMapper, instanceVertexId }) {
  const state = await getInstanceState({ g, dataMapper, instanceVertexId })
  if (!state) return false
  return state === domain.vertex.stateMachine.constants.STATES.RUNNING
    || state === domain.vertex.stateMachine.constants.STATES.COMPLETE
}
