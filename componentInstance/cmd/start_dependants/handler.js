import { domain } from '@liquid-bricks/spec-domain/domain'
import { findStateEdgeForNodeInInstanceTree } from '../dependencyUtils.js'
import { PROVIDED_STATUS, STATE_WAITING_STATUS_BY_TYPE, STATE_EDGE_LABEL_BY_TYPE } from './constants.js'

const DEPENDENT_EDGE_LABELS_BY_TYPE = Object.freeze({
  data: {
    task: domain.edge.has_dependency.task_data.constants.LABEL,
    data: domain.edge.has_dependency.data_data.constants.LABEL,
    service: domain.edge.has_dependency.service_data.constants.LABEL,
  },
  task: {
    task: domain.edge.has_dependency.task_task.constants.LABEL,
    data: domain.edge.has_dependency.data_task.constants.LABEL,
    service: domain.edge.has_dependency.service_task.constants.LABEL,
  },
  service: {
    task: domain.edge.has_dependency.task_service.constants.LABEL,
    data: domain.edge.has_dependency.data_service.constants.LABEL,
    service: domain.edge.has_dependency.service_service.constants.LABEL,
  },
})

const TASK_DEPENDENCY_EDGE_LABELS = Object.freeze([
  domain.edge.has_dependency.task_task.constants.LABEL,
  domain.edge.has_dependency.task_data.constants.LABEL,
  domain.edge.has_dependency.task_deferred.constants.LABEL,
  domain.edge.has_dependency.task_service.constants.LABEL,
])
const DATA_DEPENDENCY_EDGE_LABELS = Object.freeze([
  domain.edge.has_dependency.data_task.constants.LABEL,
  domain.edge.has_dependency.data_data.constants.LABEL,
  domain.edge.has_dependency.data_deferred.constants.LABEL,
  domain.edge.has_dependency.data_service.constants.LABEL,
])
const SERVICE_DEPENDENCY_EDGE_LABELS = Object.freeze([
  domain.edge.has_dependency.service_task.constants.LABEL,
  domain.edge.has_dependency.service_data.constants.LABEL,
  domain.edge.has_dependency.service_service.constants.LABEL,
])

export async function handler({ rootCtx: { g }, scope: {
  instanceId, instanceVertexId, stateMachineId, providedNodeId, type } }) {
  const { dependentTaskNodeIds, dependentDataNodeIds, dependentServiceNodeIds } = await gatherDependentNodes({ g, providedNodeId, type })
  const instances = await collectInstanceChain({
    g, startInstanceVertexId: instanceVertexId,
    startInstanceId: instanceId, startStateMachineId: stateMachineId
  })

  const stateEdgeCache = new Map()
  const starters = []
  for (const instance of instances) {
    const { instanceId: targetInstanceId, instanceVertexId: targetInstanceVertexId, stateMachineId: targetStateMachineId } = instance
    if (!targetInstanceId || !targetInstanceVertexId || !targetStateMachineId) continue

    const { dataStateIds, taskStateIds, serviceStateIds } = await findReadyStatesForInstance({
      g,
      stateMachineId: targetStateMachineId,
      instanceVertexId: targetInstanceVertexId,
      dependentTaskNodeIds,
      dependentDataNodeIds,
      dependentServiceNodeIds,
      stateEdgeCache,
    })
    starters.push({ instanceId: targetInstanceId, dataStateIds, taskStateIds, serviceStateIds })

  }

  return { starters }
}

async function gatherDependentNodes({ g, providedNodeId, type }) {
  if (!providedNodeId) return { dependentTaskNodeIds: [], dependentDataNodeIds: [], dependentServiceNodeIds: [] }

  const taskEdgeLabel = DEPENDENT_EDGE_LABELS_BY_TYPE[type]?.task
  const dataEdgeLabel = DEPENDENT_EDGE_LABELS_BY_TYPE[type]?.data
  const serviceEdgeLabel = DEPENDENT_EDGE_LABELS_BY_TYPE[type]?.service

  const dependentTaskNodeIds = taskEdgeLabel
    ? await g.V(providedNodeId).in(taskEdgeLabel).id()
    : []

  const dependentDataNodeIds = dataEdgeLabel
    ? await g.V(providedNodeId).in(dataEdgeLabel).id()
    : []

  const dependentServiceNodeIds = serviceEdgeLabel
    ? await g.V(providedNodeId).in(serviceEdgeLabel).id()
    : []

  return { dependentTaskNodeIds, dependentDataNodeIds, dependentServiceNodeIds }
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
      .in(domain.edge.uses_import.componentInstance_componentInstance.constants.LABEL)
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
  }

  return instances
}

async function findReadyStatesForInstance({
  g,
  stateMachineId,
  instanceVertexId,
  dependentTaskNodeIds,
  dependentDataNodeIds,
  dependentServiceNodeIds,
  stateEdgeCache,
}) {
  const [taskStateIds, dataStateIds, serviceStateIds] = await Promise.all([
    findReadyStatesForType({
      g,
      stateMachineId,
      instanceVertexId,
      candidateNodeIds: dependentTaskNodeIds,
      dependencyEdgeLabels: TASK_DEPENDENCY_EDGE_LABELS,
      stateEdgeLabel: STATE_EDGE_LABEL_BY_TYPE.task,
      expectedStatus: STATE_WAITING_STATUS_BY_TYPE.task,
      stateEdgeCache,
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
    }),
    findReadyStatesForType({
      g,
      stateMachineId,
      instanceVertexId,
      candidateNodeIds: dependentServiceNodeIds,
      dependencyEdgeLabels: SERVICE_DEPENDENCY_EDGE_LABELS,
      stateEdgeLabel: STATE_EDGE_LABEL_BY_TYPE.service,
      expectedStatus: STATE_WAITING_STATUS_BY_TYPE.service,
      stateEdgeCache,
    }),
  ])

  return { taskStateIds, dataStateIds, serviceStateIds }
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
    })
    if (!depsReady) continue

    ready.push(stateEdgeId)
  }
  return ready
}

async function dependenciesProvided({ g, nodeId, dependencyEdgeLabels, instanceVertexId, stateEdgeCache }) {
  const dependencyNodeIds = await g
    .V(nodeId)
    .out(...dependencyEdgeLabels)
    .id()
  if (!dependencyNodeIds?.length) {
    return true
  }

  for (const depNodeId of dependencyNodeIds) {
    const stateEdgeInfo = await findStateEdgeForNodeInInstanceTree({
      g,
      rootInstanceVertexId: instanceVertexId,
      targetNodeId: depNodeId,
      stateEdgeCache,
    })
    if (!stateEdgeInfo) return false

    const status = await getStateEdgeStatus({ g, stateEdgeId: stateEdgeInfo.stateEdgeId })
    if (status !== PROVIDED_STATUS) {
      return false
    }
  }
  return true
}


async function getStateEdgeStatus({ g, stateEdgeId }) {
  const [statusValues] = await g.E(stateEdgeId).valueMap('status')
  const statusMap = Array.isArray(statusValues) ? statusValues[0] : statusValues
  const statusValuesMap = statusMap?.status ?? statusMap
  return Array.isArray(statusValuesMap) ? statusValuesMap[0] : statusValuesMap
}
