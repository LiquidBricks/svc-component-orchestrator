import { domain } from '@liquid-bricks/spec-domain/domain'
import {
  findImportPathBetweenComponents,
  findStateEdgeForNodeInInstanceTree,
  hasInstanceStarted,
  isNodeProvided,
  normalizeResult,
  setNested,
  vertexLabelToType,
} from '../dependencyUtils.js'
import { STATE_WAITING_STATUS_BY_TYPE, STATE_EDGE_LABEL_BY_TYPE } from './constants.js'

const DEPENDENT_EDGE_LABELS_BY_TYPE = Object.freeze({
  data: {
    task: [
      domain.edge.has_dependency.task_data.constants.LABEL,
      domain.edge.wait_for.task_data.constants.LABEL,
    ],
    data: [
      domain.edge.has_dependency.data_data.constants.LABEL,
      domain.edge.wait_for.data_data.constants.LABEL,
    ],
  },
  task: {
    task: [
      domain.edge.has_dependency.task_task.constants.LABEL,
      domain.edge.wait_for.task_task.constants.LABEL,
    ],
    data: [
      domain.edge.has_dependency.data_task.constants.LABEL,
      domain.edge.wait_for.data_task.constants.LABEL,
    ],
  },
})

const TASK_DEPENDENCY_EDGE_LABELS = Object.freeze([
  domain.edge.has_dependency.task_task.constants.LABEL,
  domain.edge.has_dependency.task_data.constants.LABEL,
  domain.edge.has_dependency.task_deferred.constants.LABEL,
  domain.edge.wait_for.task_task.constants.LABEL,
  domain.edge.wait_for.task_data.constants.LABEL,
])
const DATA_DEPENDENCY_EDGE_LABELS = Object.freeze([
  domain.edge.has_dependency.data_task.constants.LABEL,
  domain.edge.has_dependency.data_data.constants.LABEL,
  domain.edge.has_dependency.data_deferred.constants.LABEL,
  domain.edge.wait_for.data_task.constants.LABEL,
  domain.edge.wait_for.data_data.constants.LABEL,
])

export async function handler({ rootCtx: { g }, scope: {
  instanceId, instanceVertexId, stateMachineId, providedNodeId, type } }) {
  const { dependentTaskNodeIds, dependentDataNodeIds } = await gatherDependentNodes({ g, providedNodeId, type })
  const instances = await collectInstanceChain({
    g, startInstanceVertexId: instanceVertexId,
    startInstanceId: instanceId, startStateMachineId: stateMachineId
  })

  const stateEdgeCache = new Map()
  const pathResolutionCache = new Map()
  const starters = []
  for (const instance of instances) {
    const { instanceId: targetInstanceId, instanceVertexId: targetInstanceVertexId, stateMachineId: targetStateMachineId } = instance
    if (!targetInstanceId || !targetInstanceVertexId || !targetStateMachineId) continue

    const { dataStateIds, taskStateIds } = await findReadyStatesForInstance({
      g,
      stateMachineId: targetStateMachineId,
      instanceVertexId: targetInstanceVertexId,
      dependentTaskNodeIds,
      dependentDataNodeIds,
      stateEdgeCache,
      pathResolutionCache,
    })
    const importInstanceIds = await findReadyImportsForInstance({
      g,
      instanceVertexId: targetInstanceVertexId,
      stateEdgeCache,
      pathResolutionCache,
    })
    const gateStartRequests = await findReadyGatesForInstance({
      g,
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

async function gatherDependentNodes({ g, providedNodeId, type }) {
  if (!providedNodeId) return { dependentTaskNodeIds: [], dependentDataNodeIds: [] }

  const taskEdgeLabels = DEPENDENT_EDGE_LABELS_BY_TYPE[type]?.task ?? []
  const dataEdgeLabels = DEPENDENT_EDGE_LABELS_BY_TYPE[type]?.data ?? []

  const dependentTaskNodeIds = taskEdgeLabels.length
    ? Array.from(new Set(await g.V(providedNodeId).in(...taskEdgeLabels).id()))
    : []

  const dependentDataNodeIds = dataEdgeLabels.length
    ? Array.from(new Set(await g.V(providedNodeId).in(...dataEdgeLabels).id()))
    : []

  return { dependentTaskNodeIds, dependentDataNodeIds }
}

async function collectInstanceChain({ g, startInstanceVertexId, startInstanceId, startStateMachineId }) {
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

    const parentInstanceIds = await g
      .V(current.instanceVertexId)
      .in(domain.edge.uses_import.importInstanceRef_componentInstance.constants.LABEL)
      .in(domain.edge.uses_import.componentInstance_importInstanceRef.constants.LABEL)
      .id()

    for (const parentInstanceVertexId of parentInstanceIds ?? []) {
      if (!parentInstanceVertexId || seen.has(parentInstanceVertexId)) continue

      const [parentInstanceIdMap] = await g.V(parentInstanceVertexId).valueMap('instanceId')
      const parentInstanceIdValues = parentInstanceIdMap?.instanceId ?? parentInstanceIdMap
      const parentInstanceId = Array.isArray(parentInstanceIdValues) ? parentInstanceIdValues[0] : parentInstanceIdValues
      const [parentStateMachineId] = await g
        .V(parentInstanceVertexId)
        .out(domain.edge.has_stateMachine.componentInstance_stateMachine.constants.LABEL)
        .id()

      queue.push({
        instanceVertexId: parentInstanceVertexId,
        instanceId: parentInstanceId,
        stateMachineId: parentStateMachineId,
      })
    }

    const parentGateInstanceIds = await g
      .V(current.instanceVertexId)
      .in(domain.edge.uses_gate.gateInstanceRef_componentInstance.constants.LABEL)
      .in(domain.edge.uses_gate.componentInstance_gateInstanceRef.constants.LABEL)
      .id()

    for (const parentGateInstanceVertexId of parentGateInstanceIds ?? []) {
      if (!parentGateInstanceVertexId || seen.has(parentGateInstanceVertexId)) continue

      const [parentInstanceIdMap] = await g.V(parentGateInstanceVertexId).valueMap('instanceId')
      const parentInstanceIdValues = parentInstanceIdMap?.instanceId ?? parentInstanceIdMap
      const parentInstanceId = Array.isArray(parentInstanceIdValues) ? parentInstanceIdValues[0] : parentInstanceIdValues
      const [parentStateMachineId] = await g
        .V(parentGateInstanceVertexId)
        .out(domain.edge.has_stateMachine.componentInstance_stateMachine.constants.LABEL)
        .id()

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
  g,
  stateMachineId,
  instanceVertexId,
  dependentTaskNodeIds,
  dependentDataNodeIds,
  stateEdgeCache,
  pathResolutionCache,
}) {
  const [taskStateIds, dataStateIds] = await Promise.all([
    findReadyStatesForType({
      g,
      stateMachineId,
      instanceVertexId,
      candidateNodeIds: dependentTaskNodeIds,
      dependencyEdgeLabels: TASK_DEPENDENCY_EDGE_LABELS,
      stateEdgeLabel: STATE_EDGE_LABEL_BY_TYPE.task,
      expectedStatus: STATE_WAITING_STATUS_BY_TYPE.task,
      stateEdgeCache,
      pathResolutionCache,
    }),
    findReadyStatesForType({
      g,
      stateMachineId,
      instanceVertexId,
      candidateNodeIds: dependentDataNodeIds,
      dependencyEdgeLabels: DATA_DEPENDENCY_EDGE_LABELS,
      stateEdgeLabel: STATE_EDGE_LABEL_BY_TYPE.data,
      expectedStatus: STATE_WAITING_STATUS_BY_TYPE.data,
      stateEdgeCache,
      pathResolutionCache,
    }),
  ])

  return { taskStateIds, dataStateIds }
}

async function findReadyStatesForType({
  g,
  stateMachineId,
  instanceVertexId,
  candidateNodeIds,
  dependencyEdgeLabels,
  stateEdgeLabel,
  expectedStatus,
  stateEdgeCache,
  pathResolutionCache,
}) {
  const ready = []
  const seen = new Set()
  for (const nodeId of candidateNodeIds ?? []) {
    if (!nodeId || seen.has(nodeId)) continue
    seen.add(nodeId)

    const [stateEdgeId] = await g
      .V(stateMachineId)
      .outE(stateEdgeLabel)
      .filter(_ => _.inV().has('id', nodeId))
      .id()
    if (!stateEdgeId) continue

    const statusValues = await g.E(stateEdgeId).valueMap('status')
    const statusMap = Array.isArray(statusValues) ? statusValues[0] : statusValues
    const statusValuesMap = statusMap?.status ?? statusMap
    const status = Array.isArray(statusValuesMap) ? statusValuesMap[0] : statusValuesMap
    if (status !== expectedStatus) continue

    const depsReady = await dependenciesProvided({
      g,
      nodeId,
      dependencyEdgeLabels,
      instanceVertexId,
      stateEdgeCache,
      pathResolutionCache,
    })
    if (!depsReady) continue

    ready.push(stateEdgeId)
  }
  return ready
}

async function dependenciesProvided({ g, nodeId, dependencyEdgeLabels, instanceVertexId, stateEdgeCache, pathResolutionCache }) {
  const dependencyNodeIds = await g
    .V(nodeId)
    .out(...dependencyEdgeLabels)
    .id()
  if (!dependencyNodeIds?.length) {
    return true
  }

  for (const depNodeId of dependencyNodeIds) {
    const ready = await isNodeProvided({
      g,
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

async function areWaitForsProvided({ g, rootInstanceVertexId, waitFor = [], stateEdgeCache, pathResolutionCache }) {
  if (!waitFor?.length) return true
  for (const targetNodeId of waitFor) {
    const ready = await isNodeProvided({
      g,
      rootInstanceVertexId,
      targetNodeId,
      stateEdgeCache,
      pathResolutionCache,
    })
    if (!ready) return false
  }
  return true
}

async function resolveDependencyComponentId({ g, depNodeId, depType }) {
  if (depType === 'task') {
    const [depComponentId] = await g.V(depNodeId).in(domain.edge.has_task.component_task.constants.LABEL).id()
    return depComponentId
  }
  if (depType === 'data') {
    const [depComponentId] = await g.V(depNodeId).in(domain.edge.has_data.component_data.constants.LABEL).id()
    return depComponentId
  }
  return null
}

async function buildGateDependencyPayload({
  g,
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
      g,
      rootInstanceVertexId,
      targetNodeId: depNodeId,
      stateEdgeCache,
    })
    if (!stateEdgeInfo) continue

    const [depValues] = await g.V(depNodeId).valueMap('label', 'name')
    const depLabelValues = depValues?.label ?? depValues
    const depType = vertexLabelToType(Array.isArray(depLabelValues) ? depLabelValues[0] : depLabelValues)
    const depNameValues = depValues?.name ?? depValues
    const depName = Array.isArray(depNameValues) ? depNameValues[0] : depNameValues
    if (!depType || !depName) continue

    const depComponentId = await resolveDependencyComponentId({ g, depNodeId, depType })
    const importPathCacheKey = `${dependentComponentId}:${depComponentId}`
    let aliasPath = []
    if (depComponentId && dependentComponentId && depComponentId !== dependentComponentId) {
      if (importPathCache.has(importPathCacheKey)) {
        aliasPath = importPathCache.get(importPathCacheKey) ?? []
      } else {
        aliasPath = await findImportPathBetweenComponents({
          g,
          fromComponentId: dependentComponentId,
          toComponentId: depComponentId,
        }) ?? []
        importPathCache.set(importPathCacheKey, aliasPath)
      }
    }

    const [stateValues] = await g.E(stateEdgeInfo.stateEdgeId).valueMap('result')
    const resultValues = stateValues?.result ?? stateValues
    const result = normalizeResult(Array.isArray(resultValues) ? resultValues[0] : resultValues)
    const path = [...aliasPath, depType, depName].join('.')
    setNested(deps, path, result)
  }

  return deps
}

async function findReadyImportsForInstance({
  g,
  instanceVertexId,
  stateEdgeCache,
  pathResolutionCache,
}) {
  const readyImports = []
  const importRefInstanceIds = await g
    .V(instanceVertexId)
    .out(domain.edge.uses_import.componentInstance_importInstanceRef.constants.LABEL)
    .id()

  for (const importRefInstanceId of importRefInstanceIds ?? []) {
    const [importRefId] = await g
      .V(importRefInstanceId)
      .out(domain.edge.uses_import.importInstanceRef_importRef.constants.LABEL)
      .id()
    const taskWaitForIds = importRefId
      ? await g.V(importRefId).out(domain.edge.wait_for.importRef_task.constants.LABEL).id()
      : []
    const dataWaitForIds = importRefId
      ? await g.V(importRefId).out(domain.edge.wait_for.importRef_data.constants.LABEL).id()
      : []
    const waitFor = normalizeWaitForValues([
      ...(taskWaitForIds ?? []),
      ...(dataWaitForIds ?? []),
    ])
    const [importInstanceVertexId] = await g
      .V(importRefInstanceId)
      .out(domain.edge.uses_import.importInstanceRef_componentInstance.constants.LABEL)
      .id()
    if (!importInstanceVertexId) continue
    const [instanceValues] = await g.V(importInstanceVertexId).valueMap('instanceId')
    const instanceIdValues = instanceValues?.instanceId ?? instanceValues
    const importInstanceId = Array.isArray(instanceIdValues) ? instanceIdValues[0] : instanceIdValues
    if (!importInstanceId) continue

    const ready = await areWaitForsProvided({
      g,
      rootInstanceVertexId: instanceVertexId,
      waitFor,
      stateEdgeCache,
      pathResolutionCache,
    })
    if (!ready) continue

    const alreadyStarted = await hasInstanceStarted({ g, instanceVertexId: importInstanceVertexId })
    if (alreadyStarted) continue

    readyImports.push(importInstanceId)
  }

  return readyImports
}

async function findReadyGatesForInstance({
  g,
  instanceId,
  instanceVertexId,
  stateEdgeCache,
  pathResolutionCache,
}) {
  const readyGates = []
  const importPathCache = new Map()
  const [dependentComponentId] = await g
    .V(instanceVertexId)
    .out(domain.edge.instance_of.componentInstance_component.constants.LABEL)
    .id()
  const [componentValues] = dependentComponentId
    ? await g.V(dependentComponentId).valueMap('hash')
    : []
  const componentHashValues = componentValues?.hash ?? componentValues
  const componentHash = Array.isArray(componentHashValues) ? componentHashValues[0] : componentHashValues
  const gateRefInstanceIds = await g
    .V(instanceVertexId)
    .out(domain.edge.uses_gate.componentInstance_gateInstanceRef.constants.LABEL)
    .id()
  const dispatched = new Set()

  for (const gateRefInstanceId of gateRefInstanceIds ?? []) {
    const [gateRefId] = await g
      .V(gateRefInstanceId)
      .out(domain.edge.uses_gate.gateInstanceRef_gateRef.constants.LABEL)
      .id()
    const [gateRefValues] = gateRefId
      ? await g.V(gateRefId).valueMap('alias')
      : []
    const aliasValues = gateRefValues?.alias ?? gateRefValues
    const alias = Array.isArray(aliasValues) ? aliasValues[0] : aliasValues
    if (!alias || !componentHash || !instanceId || dispatched.has(alias)) continue
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
    const waitFor = normalizeWaitForValues([
      ...(taskWaitForIds ?? []),
      ...(dataWaitForIds ?? []),
    ])
    const deps = normalizeWaitForValues([
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

    const readyWaitFor = await areWaitForsProvided({
      g,
      rootInstanceVertexId: instanceVertexId,
      waitFor,
      stateEdgeCache,
      pathResolutionCache,
    })
    if (!readyWaitFor) continue

    const depsReady = await areWaitForsProvided({
      g,
      rootInstanceVertexId: instanceVertexId,
      waitFor: deps,
      stateEdgeCache,
      pathResolutionCache,
    })
    if (!depsReady) continue

    const alreadyStarted = await hasInstanceStarted({ g, instanceVertexId: gateInstanceVertexId })
    if (alreadyStarted) continue

    const gateDeps = await buildGateDependencyPayload({
      g,
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
