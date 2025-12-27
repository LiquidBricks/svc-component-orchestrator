import { domain } from '@liquid-bricks/spec-domain/domain'

const STATE_EDGE_LABELS = Object.freeze([
  domain.edge.has_task_state.stateMachine_task.constants.LABEL,
  domain.edge.has_data_state.stateMachine_data.constants.LABEL,
  domain.edge.has_service_state.stateMachine_service.constants.LABEL,
])

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
  if (label === domain.vertex.service.constants.LABEL) return 'service'
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
      .out(domain.edge.uses_import.componentInstance_componentInstance.constants.LABEL)
      .id()
    for (const importedInstanceId of importedInstanceIds ?? []) {
      if (!importedInstanceId || visited.has(importedInstanceId)) continue
      queue.push(importedInstanceId)
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

    const edgeIds = await g.V(componentId)
      .outE(domain.edge.has_import.component_component.constants.LABEL)
      .id()

    for (const edgeId of edgeIds ?? []) {
      const [edgeValues] = await g.E(edgeId).valueMap('alias')
      const aliasValues = edgeValues?.alias ?? edgeValues
      const alias = Array.isArray(aliasValues) ? aliasValues[0] : aliasValues
      const [nextComponentId] = await g.E(edgeId).inV().id()
      if (!alias || !nextComponentId) continue
      queue.push({ componentId: nextComponentId, path: [...path, alias] })
    }
  }
  return null
}
