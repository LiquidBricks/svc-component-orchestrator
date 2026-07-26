import {
  hasInstanceStarted,
  isNodeProvided,
  LIFECYCLE_WAIT_FOR_PROPERTY,
  normalizeLifecycleWaitForValues,
} from '../dependencyUtils.js'
import { STATE_WAITING_STATUS_BY_TYPE } from './constants.js'

export async function handler({ rootCtx: { g, dataMapper }, scope: {
  instanceId, instanceVertexId, stateMachineId, providedNodeId, type, stateEdgeId, stateEdgeLabel } }) {
  const { dependentTaskNodeIds, dependentDataNodeIds } = await gatherDependentNodes({ g, dataMapper, providedNodeId, type })
  const instances = await collectInstanceChain({
    g, dataMapper, startInstanceVertexId: instanceVertexId,
    startInstanceId: instanceId, startStateMachineId: stateMachineId
  })

  const stateEdgeCache = new Map()
  const pathResolutionCache = new Map()

  if (providedNodeId && stateEdgeId) {
    stateEdgeCache.set(instanceVertexId + ':' + providedNodeId, { stateMachineId, stateEdgeId, stateEdgeLabel, instanceVertexId })
  }
  const starters = []
  for (const instance of instances) {
    const { instanceId: targetInstanceId, instanceVertexId: targetInstanceVertexId, stateMachineId: targetStateMachineId } = instance
    if (!targetInstanceId || !targetInstanceVertexId || !targetStateMachineId) continue

    const { dataStateIds, taskStateIds } = await findReadyStatesForInstance({
      g, dataMapper,
      stateMachineId: targetStateMachineId,
      instanceVertexId: targetInstanceVertexId,
      dependentTaskNodeIds,
      dependentDataNodeIds,
      stateEdgeCache,
      pathResolutionCache,
    })
    const importInstanceIds = await findReadyImportsForInstance({
      g, dataMapper,
      instanceVertexId: targetInstanceVertexId,
      stateEdgeCache,
      pathResolutionCache,
    })
    const gateInstanceIds = await findGateInstanceIdsForInstance({
      dataMapper,
      instanceVertexId: targetInstanceVertexId,
    })
    starters.push({
      instanceId: targetInstanceId,
      dataStateIds,
      taskStateIds,
      importInstanceIds,
      gateInstanceIds,
    })

  }

  return { starters }
}

async function gatherDependentNodes({ g, dataMapper, providedNodeId, type }) {
  if (!providedNodeId) return { dependentTaskNodeIds: [], dependentDataNodeIds: [] }

  if (type === 'task') {
    const [dependentTaskNodeIds, dependentDataNodeIds] = await Promise.all([
      dataMapper.query.listDependentTaskNodeIdsForTask({ vertexId: providedNodeId }),
      dataMapper.query.listDependentDataNodeIdsForTask({ vertexId: providedNodeId }),
    ])
    return {
      dependentTaskNodeIds: Array.from(new Set(dependentTaskNodeIds ?? [])),
      dependentDataNodeIds: Array.from(new Set(dependentDataNodeIds ?? [])),
    }
  }

  if (type === 'data') {
    const [dependentTaskNodeIds, dependentDataNodeIds] = await Promise.all([
      dataMapper.query.listDependentTaskNodeIdsForData({ vertexId: providedNodeId }),
      dataMapper.query.listDependentDataNodeIdsForData({ vertexId: providedNodeId }),
    ])
    return {
      dependentTaskNodeIds: Array.from(new Set(dependentTaskNodeIds ?? [])),
      dependentDataNodeIds: Array.from(new Set(dependentDataNodeIds ?? [])),
    }
  }

  return { dependentTaskNodeIds: [], dependentDataNodeIds: [] }
}

async function collectInstanceChain({ g, dataMapper, startInstanceVertexId, startInstanceId, startStateMachineId }) {
  const instances = []
  const seen = new Set()
  const queue = [{
    instanceVertexId: startInstanceVertexId,
    instanceId: startInstanceId,
    stateMachineId: startStateMachineId,
  }]

  while (queue.length) {
    const current = queue.shift()
    if (!current?.instanceVertexId || seen.has(current.instanceVertexId)) continue
    seen.add(current.instanceVertexId)
    instances.push(current)

    const parentInstanceIds = await dataMapper.query.listParentInstanceIds({ vertexId: current.instanceVertexId })

    for (const parentInstanceVertexId of parentInstanceIds ?? []) {
      if (!parentInstanceVertexId || seen.has(parentInstanceVertexId)) continue

      const [parentInstanceIdMap] = await dataMapper.query.readParentInstanceIdMap({ vertexId: parentInstanceVertexId })
      const parentInstanceIdValues = parentInstanceIdMap?.instanceId ?? parentInstanceIdMap
      const parentInstanceId = Array.isArray(parentInstanceIdValues) ? parentInstanceIdValues[0] : parentInstanceIdValues
      const [parentStateMachineId] = await dataMapper.query.readParentStateMachineId({ vertexId: parentInstanceVertexId })

      queue.push({
        instanceVertexId: parentInstanceVertexId,
        instanceId: parentInstanceId,
        stateMachineId: parentStateMachineId,
      })
    }

    const parentGateInstanceIds = await dataMapper.query.listParentGateInstanceIds({ vertexId: current.instanceVertexId })

    for (const parentGateInstanceVertexId of parentGateInstanceIds ?? []) {
      if (!parentGateInstanceVertexId || seen.has(parentGateInstanceVertexId)) continue

      const [parentInstanceIdMap] = await dataMapper.query.readParentInstanceIdMap({ vertexId: parentGateInstanceVertexId })
      const parentInstanceIdValues = parentInstanceIdMap?.instanceId ?? parentInstanceIdMap
      const parentInstanceId = Array.isArray(parentInstanceIdValues) ? parentInstanceIdValues[0] : parentInstanceIdValues
      const [parentStateMachineId] = await dataMapper.query.readParentStateMachineId({ vertexId: parentGateInstanceVertexId })

      queue.push({
        instanceVertexId: parentGateInstanceVertexId,
        instanceId: parentInstanceId,
        stateMachineId: parentStateMachineId,
      })
    }
  }

  return instances
}

async function findReadyStatesForInstance({
  g, dataMapper,
  stateMachineId,
  instanceVertexId,
  dependentTaskNodeIds,
  dependentDataNodeIds,
  stateEdgeCache,
  pathResolutionCache,
}) {
  const [taskStateIds, dataStateIds] = await Promise.all([
    findReadyStatesForType({
      g, dataMapper,
      stateMachineId,
      instanceVertexId,
      candidateNodeIds: dependentTaskNodeIds,
      nodeType: 'task',
      expectedStatus: STATE_WAITING_STATUS_BY_TYPE.task,
      stateEdgeCache,
      pathResolutionCache,
    }),
    findReadyStatesForType({
      g, dataMapper,
      stateMachineId,
      instanceVertexId,
      candidateNodeIds: dependentDataNodeIds,
      nodeType: 'data',
      expectedStatus: STATE_WAITING_STATUS_BY_TYPE.data,
      stateEdgeCache,
      pathResolutionCache,
    }),
  ])

  return { taskStateIds, dataStateIds }
}

async function findReadyStatesForType({
  g, dataMapper,
  stateMachineId,
  instanceVertexId,
  candidateNodeIds,
  nodeType,
  expectedStatus,
  stateEdgeCache,
  pathResolutionCache,
}) {
  const ready = []
  const seen = new Set()
  for (const nodeId of candidateNodeIds ?? []) {
    if (!nodeId || seen.has(nodeId)) continue
    seen.add(nodeId)

    const [stateEdgeId] = nodeType === 'task'
      ? await dataMapper.query.findTaskStateEdgeIdForTargetNode({ vertexId: stateMachineId, id: nodeId })
      : await dataMapper.query.findDataStateEdgeIdForTargetNode({ vertexId: stateMachineId, id: nodeId })
    if (!stateEdgeId) continue

    const statusValues = await dataMapper.query.readStateEdgeStatus({ edgeId: stateEdgeId })
    const statusMap = Array.isArray(statusValues) ? statusValues[0] : statusValues
    const statusValuesMap = statusMap?.status ?? statusMap
    const status = Array.isArray(statusValuesMap) ? statusValuesMap[0] : statusValuesMap
    if (status !== expectedStatus) continue

    const depsReady = await dependenciesProvided({
      g, dataMapper,
      nodeId,
      nodeType,
      instanceVertexId,
      stateEdgeCache,
      pathResolutionCache,
    })
    if (!depsReady) continue

    ready.push(stateEdgeId)
  }
  return ready
}

async function dependenciesProvided({ g, dataMapper, nodeId, nodeType, instanceVertexId, stateEdgeCache, pathResolutionCache }) {
  const dependencyNodeIds = nodeType === 'task'
    ? await dataMapper.query.listTaskDependencyAndWaitForNodeIds({ vertexId: nodeId })
    : await dataMapper.query.listDataDependencyAndWaitForNodeIds({ vertexId: nodeId })
  if (!dependencyNodeIds?.length) {
    return true
  }

  for (const depNodeId of dependencyNodeIds) {
    const ready = await isNodeProvided({
      g, dataMapper,
      rootInstanceVertexId: instanceVertexId,
      targetNodeId: depNodeId,
      stateEdgeCache,
      pathResolutionCache,
    })
    if (!ready) return false
  }
  return true
}

function normalizeWaitForValues(waitForValues = []) {
  const raw = Array.isArray(waitForValues) && waitForValues.length === 1 ? waitForValues[0] : waitForValues
  const list = Array.isArray(raw)
    ? raw
    : (raw === undefined || raw === null ? [] : [raw])
  return Array.from(new Set(
    list
      .filter((value) => value !== undefined && value !== null && value !== '')
      .map(String)
  ))
}

async function areWaitForsProvided({ g, dataMapper, rootInstanceVertexId, waitFor = [], stateEdgeCache, pathResolutionCache }) {
  if (!waitFor?.length) return true
  for (const targetNodeId of waitFor) {
    const ready = await isNodeProvided({
      g, dataMapper,
      rootInstanceVertexId,
      targetNodeId,
      stateEdgeCache,
      pathResolutionCache,
    })
    if (!ready) return false
  }
  return true
}

async function findReadyImportsForInstance({
  g, dataMapper,
  instanceVertexId,
  stateEdgeCache,
  pathResolutionCache,
}) {
  const readyImports = []
  const importRefInstanceIds = await dataMapper.query.listImportRefInstanceIds({ vertexId: instanceVertexId })

  for (const importRefInstanceId of importRefInstanceIds ?? []) {
    const [importRefId] = await dataMapper.query.findImportRefIdForInstanceRef({ vertexId: importRefInstanceId })
    const taskWaitForIds = importRefId
      ? await dataMapper.query.listImportTaskWaitForIds({ vertexId: importRefId })
      : []
    const dataWaitForIds = importRefId
      ? await dataMapper.query.listImportDataWaitForIds({ vertexId: importRefId })
      : []
    const [lifecycleWaitForValues] = importRefId
      ? await dataMapper.query.readLifecycleWaitForValues({ importRefId })
      : []
    const lifecycleWaitFor = normalizeLifecycleWaitForValues(
      lifecycleWaitForValues?.[LIFECYCLE_WAIT_FOR_PROPERTY],
    )
    const waitFor = normalizeWaitForValues([
      ...(taskWaitForIds ?? []),
      ...(dataWaitForIds ?? []),
      ...lifecycleWaitFor,
    ])
    const [importInstanceVertexId] = await dataMapper.query.findImportInstanceVertexId({ vertexId: importRefInstanceId })
    if (!importInstanceVertexId) continue
    const [instanceValues] = await dataMapper.query.readImportInstanceId({ vertexId: importInstanceVertexId })
    const instanceIdValues = instanceValues?.instanceId ?? instanceValues
    const importInstanceId = Array.isArray(instanceIdValues) ? instanceIdValues[0] : instanceIdValues
    if (!importInstanceId) continue

    const ready = await areWaitForsProvided({
      g, dataMapper,
      rootInstanceVertexId: instanceVertexId,
      waitFor,
      stateEdgeCache,
      pathResolutionCache,
    })
    if (!ready) continue

    const alreadyStarted = await hasInstanceStarted({ g, dataMapper, instanceVertexId: importInstanceVertexId })
    if (alreadyStarted) continue

    readyImports.push(importInstanceId)
  }

  return readyImports
}

async function findGateInstanceIdsForInstance({
  dataMapper,
  instanceVertexId,
}) {
  const gateInstanceIds = []
  const gateInstanceVertexIds = await dataMapper.query.listGatedInstanceIds({ vertexId: instanceVertexId })
  const dispatched = new Set()

  for (const gateInstanceVertexId of gateInstanceVertexIds ?? []) {
    const [instanceValues] = await dataMapper.query.readGateInstanceId({ vertexId: gateInstanceVertexId })
    const instanceIdValues = instanceValues?.instanceId ?? instanceValues
    const gateInstanceId = Array.isArray(instanceIdValues) ? instanceIdValues[0] : instanceIdValues
    if (!gateInstanceId || dispatched.has(gateInstanceId)) continue

    dispatched.add(gateInstanceId)
    gateInstanceIds.push(gateInstanceId)
  }

  return gateInstanceIds
}
