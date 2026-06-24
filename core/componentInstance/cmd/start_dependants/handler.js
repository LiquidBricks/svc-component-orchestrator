import {
  findImportPathBetweenComponents,
  findStateEdgeForNodeInInstanceTree,
  hasInstanceStarted,
  isNodeProvided,
  LIFECYCLE_WAIT_FOR_PROPERTY,
  normalizeLifecycleWaitForValues,
  normalizeResult,
  setNested,
  vertexLabelToType,
} from '../dependencyUtils.js'
import { STATE_WAITING_STATUS_BY_TYPE } from './constants.js'

export async function handler({ rootCtx: { g, dataMapper }, scope: {
  instanceId, instanceVertexId, stateMachineId, providedNodeId, type } }) {
  const { dependentTaskNodeIds, dependentDataNodeIds } = await gatherDependentNodes({ g, dataMapper, providedNodeId, type })
  const instances = await collectInstanceChain({
    g, dataMapper, startInstanceVertexId: instanceVertexId,
    startInstanceId: instanceId, startStateMachineId: stateMachineId
  })

  const stateEdgeCache = new Map()
  const pathResolutionCache = new Map()
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
    const gateStartRequests = await findReadyGatesForInstance({
      g, dataMapper,
      instanceId: targetInstanceId,
      instanceVertexId: targetInstanceVertexId,
      stateEdgeCache,
      pathResolutionCache,
    })
    starters.push({
      instanceId: targetInstanceId,
      dataStateIds,
      taskStateIds,
      importInstanceIds,
      gateStartRequests,
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

async function resolveDependencyComponentId({ g, dataMapper, depNodeId, depType }) {
  if (depType === 'task') {
    const [depComponentId] = await dataMapper.query.findComponentIdForTask({ vertexId: depNodeId })
    return depComponentId
  }
  if (depType === 'data') {
    const [depComponentId] = await dataMapper.query.findComponentIdForData({ vertexId: depNodeId })
    return depComponentId
  }
  return null
}

async function buildGateDependencyPayload({
  g, dataMapper,
  rootInstanceVertexId,
  dependentComponentId,
  dependencyNodeIds = [],
  stateEdgeCache,
  importPathCache,
}) {
  const deps = {}
  const seen = new Set()

  for (const depNodeId of dependencyNodeIds ?? []) {
    if (!depNodeId || seen.has(depNodeId)) continue
    seen.add(depNodeId)

    const stateEdgeInfo = await findStateEdgeForNodeInInstanceTree({
      g, dataMapper,
      rootInstanceVertexId,
      targetNodeId: depNodeId,
      stateEdgeCache,
    })
    if (!stateEdgeInfo) continue

    const [depValues] = await dataMapper.query.readDepValues({ vertexId: depNodeId })
    const depLabelValues = depValues?.label ?? depValues
    const depType = vertexLabelToType(Array.isArray(depLabelValues) ? depLabelValues[0] : depLabelValues)
    const depNameValues = depValues?.name ?? depValues
    const depName = Array.isArray(depNameValues) ? depNameValues[0] : depNameValues
    if (!depType || !depName) continue

    const depComponentId = await resolveDependencyComponentId({ g, dataMapper, depNodeId, depType })
    const importPathCacheKey = `${dependentComponentId}:${depComponentId}`
    let aliasPath = []
    if (depComponentId && dependentComponentId && depComponentId !== dependentComponentId) {
      if (importPathCache.has(importPathCacheKey)) {
        aliasPath = importPathCache.get(importPathCacheKey) ?? []
      } else {
        aliasPath = await findImportPathBetweenComponents({
          g, dataMapper,
          fromComponentId: dependentComponentId,
          toComponentId: depComponentId,
        }) ?? []
        importPathCache.set(importPathCacheKey, aliasPath)
      }
    }

    const [stateValues] = await dataMapper.query.readDependencyStateResult({ edgeId: stateEdgeInfo.stateEdgeId })
    const resultValues = stateValues?.result ?? stateValues
    const result = normalizeResult(Array.isArray(resultValues) ? resultValues[0] : resultValues)
    const path = [...aliasPath, depType, depName].join('.')
    setNested(deps, path, result)
  }

  return deps
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

async function findReadyGatesForInstance({
  g, dataMapper,
  instanceId,
  instanceVertexId,
  stateEdgeCache,
  pathResolutionCache,
}) {
  const readyGates = []
  const importPathCache = new Map()
  const [dependentComponentId] = await dataMapper.query.findDependentComponentId({ vertexId: instanceVertexId })
  const [componentValues] = dependentComponentId
    ? await dataMapper.query.readComponentValues({ vertexId: dependentComponentId })
    : []
  const componentHashValues = componentValues?.hash ?? componentValues
  const componentHash = Array.isArray(componentHashValues) ? componentHashValues[0] : componentHashValues
  const gateRefInstanceIds = await dataMapper.query.listGateRefInstanceIds({ vertexId: instanceVertexId })
  const dispatched = new Set()

  for (const gateRefInstanceId of gateRefInstanceIds ?? []) {
    const [gateRefId] = await dataMapper.query.findGateRefIdForInstanceRef({ vertexId: gateRefInstanceId })
    const [gateRefValues] = gateRefId
      ? await dataMapper.query.readGateRefAlias({ vertexId: gateRefId })
      : []
    const aliasValues = gateRefValues?.alias ?? gateRefValues
    const alias = Array.isArray(aliasValues) ? aliasValues[0] : aliasValues
    if (!alias || !componentHash || !instanceId || dispatched.has(alias)) continue
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
    const waitFor = normalizeWaitForValues([
      ...(taskWaitForIds ?? []),
      ...(dataWaitForIds ?? []),
    ])
    const deps = normalizeWaitForValues([
      ...(depsTaskIds ?? []),
      ...(depsDataIds ?? []),
    ])

    const [gateInstanceVertexId] = await dataMapper.query.findGateInstanceVertexIdForRef({ vertexId: gateRefInstanceId })
    if (!gateInstanceVertexId) continue
    const [instanceValues] = await dataMapper.query.readGateInstanceId({ vertexId: gateInstanceVertexId })
    const instanceIdValues = instanceValues?.instanceId ?? instanceValues
    const gateInstanceId = Array.isArray(instanceIdValues) ? instanceIdValues[0] : instanceIdValues
    if (!gateInstanceId) continue

    const readyWaitFor = await areWaitForsProvided({
      g, dataMapper,
      rootInstanceVertexId: instanceVertexId,
      waitFor,
      stateEdgeCache,
      pathResolutionCache,
    })
    if (!readyWaitFor) continue

    const depsReady = await areWaitForsProvided({
      g, dataMapper,
      rootInstanceVertexId: instanceVertexId,
      waitFor: deps,
      stateEdgeCache,
      pathResolutionCache,
    })
    if (!depsReady) continue

    const alreadyStarted = await hasInstanceStarted({ g, dataMapper, instanceVertexId: gateInstanceVertexId })
    if (alreadyStarted) continue

    const gateDeps = await buildGateDependencyPayload({
      g, dataMapper,
      rootInstanceVertexId: instanceVertexId,
      dependentComponentId,
      dependencyNodeIds: deps,
      stateEdgeCache,
      importPathCache,
    })
    dispatched.add(alias)
    readyGates.push({
      instanceId,
      componentHash,
      name: alias,
      type: 'gate',
      deps: gateDeps,
    })
  }

  return readyGates
}
